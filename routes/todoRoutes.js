import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

router.get("/", verifyToken, async (req, res) => {
  const todos = await prisma.todo.findMany({ where: { userId: req.userId } });
  res.json(todos);
});

router.post("/", verifyToken, async (req, res) => {
  const { title } = req.body;
  const todo = await prisma.todo.create({
    data: { title, userId: req.userId },
  });
  res.json(todo);
});

router.put("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { title, completed } = req.body;
  const todo = await prisma.todo.update({
    where: { id: Number(id) },
    data: { title, completed },
  });
  res.json(todo);
});

router.delete("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  await prisma.todo.delete({ where: { id: Number(id) } });
  res.json({ message: "Todo deleted" });
});

export default router;
