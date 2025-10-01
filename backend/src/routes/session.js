import express from "express";

import { currentUserFromSession } from "../utils/auth.js";
import { login } from "../controllers/auth/login.js";
import { register } from "../controllers/auth/register.js";
import { getProfile, updateProfile } from "../controllers/auth/profile.js";

function ensureAuthenticated(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: "Not authenticated" });
  return next();
}

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ authenticated: !!req.session.user, user: currentUserFromSession(req) });
});

router.post("/login", login);

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

router.post("/register", register);

router.get("/profile", ensureAuthenticated, getProfile);
router.put("/profile", ensureAuthenticated, updateProfile);

export default router;
