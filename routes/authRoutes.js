import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  console.log("Received registration request:", { name, email });

  const hashedPassword = await bcrypt.hash(password, 10);
  console.log("Password hashed successfully");

  try {
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });
    console.log("User registered successfully:", user);
    res.json(user);
  } catch (error) {
    console.error("Error during registration:", error.message);
    res.status(400).json({ message: "User already exists" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("Received login request for email:", email);

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log("User not found");
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log("Invalid password");
      return res.status(400).json({ message: "Invalid credentials" });
    }

    console.log("Login successful for user:", email);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    console.log("JWT token generated:", token);

    res.json({ token });
  } catch (error) {
    console.error("Error during login:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
