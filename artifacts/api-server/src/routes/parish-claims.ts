import { Router, type IRouter } from "express";
import nodemailer from "nodemailer";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface PendingCode {
  code: string;
  expiresAt: number;
  email: string;
  parishName: string;
}

// In-memory store: parishId → pending verification
const pendingCodes = new Map<string, PendingCode>();

let transporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;
  const account = await nodemailer.createTestAccount();
  transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: account.user, pass: account.pass },
  });
  logger.info({ user: account.user }, "Ethereal test account created");
  return transporter;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/parish-claims/send-code
router.post("/parish-claims/send-code", async (req, res) => {
  const { parishId, parishName, email, name, phone } = req.body as {
    parishId?: string;
    parishName?: string;
    email?: string;
    name?: string;
    phone?: string;
  };

  if (!parishId || !parishName || !email || !name || !phone) {
    res.status(400).json({ error: "Tous les champs sont requis." });
    return;
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    res.status(400).json({ error: "Adresse e-mail invalide." });
    return;
  }

  const code = generateCode();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

  pendingCodes.set(parishId, { code, expiresAt, email, parishName });

  try {
    const t = await getTransporter();
    const info = await t.sendMail({
      from: '"Paroisse Connect" <noreply@paroisse-connect.fr>',
      to: email,
      subject: `Votre code de vérification — ${parishName}`,
      text: [
        `Bonjour ${name},`,
        ``,
        `Vous avez demandé à revendiquer la gestion de la paroisse « ${parishName} » sur Paroisse Connect.`,
        ``,
        `Votre code de vérification est :`,
        ``,
        `  ${code}`,
        ``,
        `Ce code est valable 15 minutes.`,
        `Si vous n'avez pas effectué cette demande, ignorez ce message.`,
        ``,
        `— L'équipe Paroisse Connect`,
      ].join("\n"),
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px 24px;background:#faf7f4;border-radius:12px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="display:inline-block;background:#8B1A1A;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:28px;color:#fff">✝</div>
            <h2 style="color:#8B1A1A;margin-top:12px">Paroisse Connect</h2>
          </div>
          <p>Bonjour <strong>${name}</strong>,</p>
          <p>Vous avez demandé à revendiquer la gestion de la paroisse <strong>${parishName}</strong>.</p>
          <p>Votre code de vérification est :</p>
          <div style="text-align:center;margin:24px 0">
            <span style="display:inline-block;background:#8B1A1A;color:#fff;font-size:32px;font-weight:700;letter-spacing:12px;padding:16px 28px;border-radius:12px">${code}</span>
          </div>
          <p style="color:#888;font-size:13px">Ce code est valable <strong>15 minutes</strong>. Si vous n'avez pas effectué cette demande, ignorez ce message.</p>
          <hr style="border:none;border-top:1px solid #e4d5c7;margin:24px 0"/>
          <p style="color:#aaa;font-size:12px;text-align:center">L'équipe Paroisse Connect</p>
        </div>
      `,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    req.log.info({ parishId, email, previewUrl }, "Verification email sent");

    res.json({ success: true, previewUrl: previewUrl || null });
  } catch (err) {
    req.log.error({ err }, "Failed to send verification email");
    // Still succeed — code is stored, user can retry
    res.json({ success: true, previewUrl: null });
  }
});

// POST /api/parish-claims/verify-code
router.post("/parish-claims/verify-code", (req, res) => {
  const { parishId, code } = req.body as {
    parishId?: string;
    code?: string;
  };

  if (!parishId || !code) {
    res.status(400).json({ error: "parishId et code sont requis." });
    return;
  }

  const pending = pendingCodes.get(parishId);

  if (!pending) {
    res.json({ valid: false, reason: "no_code" });
    return;
  }

  if (Date.now() > pending.expiresAt) {
    pendingCodes.delete(parishId);
    res.json({ valid: false, reason: "expired" });
    return;
  }

  if (pending.code !== code.trim()) {
    res.json({ valid: false, reason: "wrong_code" });
    return;
  }

  // Valid — consume the code
  pendingCodes.delete(parishId);
  req.log.info({ parishId }, "Parish claim code verified successfully");
  res.json({ valid: true });
});

export default router;
