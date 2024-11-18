import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

router.get("/", verifyToken, async (req, res) => {
  console.log(`GET request to '/api/todos' by user: ${req.userId}`);
  try {
    const todos = await prisma.todo.findMany({ where: { userId: req.userId } });
    console.log("Fetched todos:", todos);
    res.json(todos);
  } catch (error) {
    console.error("Error fetching todos:", error.message);
    res.status(500).json({ message: "Error fetching todos" });
  }
});

router.post("/", verifyToken, async (req, res) => {
  const { title } = req.body;
  console.log(`POST request to '/api/todos' by user: ${req.userId} with title: ${title}`);
  try {
    const todo = await prisma.todo.create({
      data: { title, userId: req.userId },
    });
    console.log("Todo created successfully:", todo);
    res.json(todo);
  } catch (error) {
    console.error("Error creating todo:", error.message);
    res.status(500).json({ message: "Error creating todo" });
  }
});

router.put("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { title, completed } = req.body;
  console.log(`PUT request to '/api/todos/${id}' by user: ${req.userId} with data:`, { title, completed });
  try {
    const todo = await prisma.todo.update({
      where: { id: Number(id) },
      data: { title, completed },
    });
    console.log("Todo updated successfully:", todo);
    res.json(todo);
  } catch (error) {
    console.error("Error updating todo:", error.message);
    res.status(500).json({ message: "Error updating todo" });
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  console.log(`DELETE request to '/api/todos/${id}' by user: ${req.userId}`);
  try {
    await prisma.todo.delete({ where: { id: Number(id) } });
    console.log("Todo deleted successfully");
    res.json({ message: "Todo deleted" });
  } catch (error) {
    console.error("Error deleting todo:", error.message);
    res.status(500).json({ message: "Error deleting todo" });
  }
});

export default router;
