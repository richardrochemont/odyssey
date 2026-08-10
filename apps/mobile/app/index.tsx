import React from "react";
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from "react-native";

export default function IndexScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Hearthlane Cockpit</Text>
        <Text style={styles.subtitle}>Mobile Overview (Scaffold)</Text>
      </View>

      <View style={styles.kpiGrid}>
        <View style={styles.card}>
          <Text style={styles.cardValue}>12</Text>
          <Text style={styles.cardLabel}>Total Units</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardValue}>8</Text>
          <Text style={styles.cardLabel}>Occupied</Text>
        </View>
        <View style={styles.card}>
          <Text style={[styles.cardValue, { color: "#d90429" }]}>3</Text>
          <Text style={styles.cardLabel}>Open Requests</Text>
        </View>
        <View style={styles.card}>
          <Text style={[styles.cardValue, { color: "#e85d04" }]}>1</Text>
          <Text style={styles.cardLabel}>Due Tasks</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Urgent Attention Queue</Text>
        
        <View style={styles.listItem}>
          <Text style={styles.itemTitle}>Lease Expiry: David Green</Text>
          <Text style={styles.itemDesc}>Expires in 15 days (Oakridge Unit 201)</Text>
        </View>

        <View style={styles.listItem}>
          <Text style={styles.itemTitle}>HVAC Failure (Maple Unit A)</Text>
          <Text style={styles.itemDesc}>Assigned to Precision HVAC • Urgent</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Switch to Desktop Version</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#faf9f6", // warm off-white background
  },
  header: {
    padding: 24,
    backgroundColor: "#1b4332", // deep green accent
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
  },
  subtitle: {
    fontSize: 14,
    color: "#a3b18a",
    marginTop: 4,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2b2d42",
  },
  cardLabel: {
    fontSize: 12,
    color: "#8d99ae",
    marginTop: 4,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2b2d42",
    marginBottom: 12,
  },
  listItem: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#1b4332",
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2b2d42",
  },
  itemDesc: {
    fontSize: 12,
    color: "#8d99ae",
    marginTop: 4,
  },
  button: {
    margin: 16,
    backgroundColor: "#2b2d42",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "bold",
  },
});
