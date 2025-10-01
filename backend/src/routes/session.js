import express from "express";

import { currentUserFromSession } from "../utils/auth.js";
import { login } from "../controllers/auth/login.js";
import { register } from "../controllers/auth/register.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ authenticated: !!req.session.user, user: currentUserFromSession(req) });
});

router.post("/login", login);

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

router.post("/register", register);

export default router;
