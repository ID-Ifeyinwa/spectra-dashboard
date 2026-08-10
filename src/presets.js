// Realistic Preset Datasets for 7-Wavelength Spectrometer Reading
// Wavelengths: [1650nm, 1300nm, 950nm, 740nm, 574nm, 365nm, 260nm]

export const SENSOR_PRESETS = [
  {
    id: "starchy_waste",
    name: "Starchy Waste (Bread & Rice)",
    category: "High Carbohydrate",
    description: "High NIR absorbance at 1650nm & 1300nm typical of complex starches.",
    dark: 210,
    leds: [22400, 19800, 11500, 15200, 14800, 18900, 21000],
    distance: 96.0 // 70% fill
  },
  {
    id: "protein_waste",
    name: "Protein-Rich (Fish & Meat)",
    category: "High Protein",
    description: "Strong UV/VIS absorption at 260nm & 365nm from peptide chains.",
    dark: 195,
    leds: [14200, 13800, 9200, 12600, 13100, 24500, 27800],
    distance: 128.0 // 60% fill
  },
  {
    id: "lipid_waste",
    name: "Oily Waste (Fried Oils & Fat)",
    category: "High Lipid",
    description: "Specific C-H absorption bands near 950nm & 1300nm.",
    dark: 205,
    leds: [16800, 24100, 18900, 14200, 12900, 15400, 17200],
    distance: 160.0 // 50% fill
  },
  {
    id: "fruit_produce",
    name: "Produce (Fruits & Veggies)",
    category: "High Moisture",
    description: "High water absorption profile across mid-NIR spectrum.",
    dark: 180,
    leds: [9800, 10200, 7400, 11000, 16400, 14200, 15100],
    distance: 64.0 // 80% fill
  },
  {
    id: "cafeteria_mix",
    name: "Cafeteria Food Scraps",
    category: "Balanced Mixed Waste",
    description: "Balanced absorption across all 7 optical spectrum bands.",
    dark: 200,
    leds: [15600, 16200, 10800, 13900, 14500, 17800, 19400],
    distance: 112.0 // 65% fill
  }
];
