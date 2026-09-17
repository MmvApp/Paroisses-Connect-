/**
 * TimePickerField — sélecteur d'heure cross-platform
 *
 * • Web     : <input type="time"> natif du navigateur
 * • iOS     : DateTimePicker en mode spinner dans un bottom-sheet Modal
 * • Android : DateTimePicker en mode "default" (dialog natif du système)
 *
 * Valeur entrante/sortante : chaîne "HH:mm" (ex. "19:00"), ou "" si vide.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  ViewStyle,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convertit "HH:mm" en Date (date du jour, heure renseignée). */
function parseTime(timeStr: string): Date {
  const d = new Date();
  const [rawH, rawM] = (timeStr || "10:00").split(":");
  const h = parseInt(rawH, 10);
  const m = parseInt(rawM, 10);
  d.setHours(isNaN(h) ? 10 : h, isNaN(m) ? 0 : m, 0, 0);
  return d;
}

/** Formate une Date en "HH:mm". */
function formatTime(date: Date): string {
  return [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join(":");
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface TimePickerFieldProps {
  /** Libellé affiché au-dessus du champ. */
  label: string;
  /** Valeur courante au format "HH:mm". Chaîne vide = non renseigné. */
  value: string;
  /** Appelé à chaque changement avec la nouvelle valeur "HH:mm". */
  onChange: (v: string) => void;
  /** Texte affiché quand aucune valeur n'est encore sélectionnée. */
  placeholder?: string;
  /** Style optionnel appliqué au conteneur. */
  containerStyle?: ViewStyle;
  /** Couleur d'accentuation (bordures, icônes). Défaut : #C9A24A */
  accentColor?: string;
  /** Couleur de bordure. Défaut : #E5E0D8 */
  borderColor?: string;
}

// ─── Composant ───────────────────────────────────────────────────────────────

export function TimePickerField({
  label,
  value,
  onChange,
  placeholder = "10:00",
  containerStyle,
  accentColor = "#C9A24A",
  borderColor = "#E5E0D8",
}: TimePickerFieldProps) {
  const [show, setShow] = useState(false);

  // Date utilisée par le picker natif (toujours valide)
  const pickerDate = parseTime(value || placeholder);

  const handleNativeChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShow(false);
    if (selected) onChange(formatTime(selected));
  };

  // ── Web : <input type="time"> natif ────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <View style={[s.wrapper, containerStyle]}>
        <Text style={s.label}>{label}</Text>
        <View style={[s.btn, { borderColor }]}>
          <Feather name="clock" size={15} color={accentColor} />
          {/* @ts-ignore – élément HTML valide en RN Web */}
          <input
            type="time"
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange(e.target.value)
            }
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 15,
              fontFamily: "Inter_500Medium, sans-serif",
              color: value ? "#111111" : "#9AA3B0",
              backgroundColor: "transparent",
              cursor: "pointer",
              minWidth: 0,
            }}
          />
        </View>
      </View>
    );
  }

  // ── Bouton commun iOS + Android ─────────────────────────────────────────────
  const trigger = (
    <TouchableOpacity
      style={[s.btn, { borderColor }]}
      onPress={() => setShow(true)}
      activeOpacity={0.8}
    >
      <Feather name="clock" size={15} color={accentColor} />
      <Text style={[s.btnText, !value && s.btnPlaceholder]}>
        {value || placeholder}
      </Text>
      <Feather name="chevron-down" size={15} color="#9AA3B0" />
    </TouchableOpacity>
  );

  // ── iOS : spinner dans un bottom-sheet Modal ────────────────────────────────
  if (Platform.OS === "ios") {
    return (
      <View style={[s.wrapper, containerStyle]}>
        <Text style={s.label}>{label}</Text>
        {trigger}
        {show && (
          <Modal transparent animationType="slide" statusBarTranslucent>
            <View style={s.pickerModal}>
              <View style={s.pickerSheet}>
                <View style={s.pickerHeader}>
                  <Text style={s.pickerTitle}>{label}</Text>
                  <TouchableOpacity onPress={() => setShow(false)}>
                    <Text style={[s.pickerDone, { color: accentColor }]}>
                      Valider
                    </Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  display="spinner"
                  locale="fr-FR"
                  onChange={handleNativeChange}
                />
              </View>
            </View>
          </Modal>
        )}
      </View>
    );
  }

  // ── Android : dialog natif ──────────────────────────────────────────────────
  return (
    <View style={[s.wrapper, containerStyle]}>
      <Text style={s.label}>{label}</Text>
      {trigger}
      {show && (
        <DateTimePicker
          value={pickerDate}
          mode="time"
          display="default"
          onChange={handleNativeChange}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#7A7A8A",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  btnText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#111111",
  },
  btnPlaceholder: { color: "#9AA3B0" },
  pickerModal: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDE8",
  },
  pickerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#111111" },
  pickerDone: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
