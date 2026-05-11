import { Router } from "express";
import {
  changePassword,
  getSession,
  listUsers,
  login,
} from "../controllers/auth.controller.ts";

const router = Router();

router.get("/users", listUsers);
router.post("/login", login);
router.get("/session", getSession);
router.post("/change-password", changePassword);

export default router;
