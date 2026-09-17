import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { collection, getDocs, query, where } from "firebase/firestore";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { db } from "@/lib/firebase";

const GOLD = "#C9A24A";
const DARK = "#111111";
const MUTED = "#666666";
const BORDER = "#EADFCB";
const CREAM = "#FFF8EC";

export function ClaimsSummary({
  parishId,
  canReview,
}: {
  parishId: string | null;
  canReview: boolean;
}) {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    if (!parishId) {
      setPendingCount(null);
      return () => { active = false; };
    }

    void getDocs(
      query(
        collection(db, "parishClaims"),
        where("parishId", "==", parishId),
      ),
    )
      .then((snap) => {
        if (active) {
          setPendingCount(snap.docs.filter((claim) => claim.data().status === "pending").length);
        }
      })
      .catch(() => {
        if (active) setPendingCount(0);
      });

    return () => { active = false; };
  }, [parishId]);

  if (!parishId) return null;

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Feather name="file-text" size={20} color={GOLD} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Demandes / Revendications</Text>
        <Text style={styles.subtitle}>
          {pendingCount === null
            ? "Chargement des demandes…"
            : pendingCount === 0
              ? "Aucune demande en attente"
              : `${pendingCount} demande${pendingCount > 1 ? "s" : ""} en attente`}
        </Text>
        {!canReview && pendingCount !== null && pendingCount > 0 && (
          <Text style={styles.readOnly}>Consultation uniquement — validation réservée au prêtre ou au Super Admin.</Text>
        )}
      </View>
      {pendingCount === null ? (
        <ActivityIndicator size="small" color={GOLD} />
      ) : (
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/admin-claims")}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Voir</Text>
          <Feather name="chevron-right" size={15} color={DARK} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GOLD + "18",
  },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontFamily: "Inter_700Bold", color: DARK },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED },
  readOnly: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 15 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: CREAM,
  },
  buttonText: { fontSize: 12, fontFamily: "Inter_700Bold", color: DARK },
});