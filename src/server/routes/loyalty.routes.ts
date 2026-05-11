import { Router } from "express";
import { getLoyaltyInfo, addLoyaltyPoints, getAllUsers, syncUser, deleteUser } from "../controllers/loyalty.controller.ts";

const router = Router();

router.get("/", getAllUsers);
router.post("/sync", syncUser);
router.get("/:userId", getLoyaltyInfo);
router.post("/add", addLoyaltyPoints);
router.delete("/:id", deleteUser);

export default router;
