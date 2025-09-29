import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const WEATHER_API = "https://api.data.gov.sg/v1/environment/2-hour-weather-forecast";
const RAINFALL_API = "https://api.data.gov.sg/v1/environment/rainfall";
const PSI_API = "https://api.data.gov.sg/v1/environment/psi";
const TEMP_API = "https://api.data.gov.sg/v1/environment/air-temperature";

router.get("/", async (_req, res) => {
  try {
    const [w, rf, psi, tmp] = await Promise.all([
      fetch(WEATHER_API),
      fetch(RAINFALL_API),
      fetch(PSI_API),
      fetch(TEMP_API),
    ]);
    if (!w.ok) return res.status(502).json({ error: "Upstream weather error" });
    const weather = await w.json();
    const rainfall = rf.ok ? await rf.json() : null;
    const psiData = psi.ok ? await psi.json() : null;
    const temp = tmp.ok ? await tmp.json() : null;
    res.json({ ...weather, rainfall, psi: psiData, temp });
  } catch (e) {
    res.status(500).json({ error: "Failed to load weather" });
  }
});

export default router;

