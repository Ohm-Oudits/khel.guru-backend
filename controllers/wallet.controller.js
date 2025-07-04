import Balance from "../models/balance.model.js";
import Transaction from "../models/transaction.model.js";
import User from "../models/user.model.js";

// Get user balance
export const getBalance = async (req, res, next) => {
  try {
    const userId = req.user._id;
    let balance = await Balance.findOne({ userId });
    if (!balance) {
      balance = await Balance.create({ userId, balance: 0 });
    }
    res.json({ balance: balance.balance });
  } catch (err) {
    next(err);
  }
};

// Deposit money
export const deposit = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    let balance = await Balance.findOne({ userId });
    if (!balance) {
      balance = await Balance.create({ userId, balance: 0 });
    }
    balance.balance += amount;
    await balance.save();
    await Transaction.create({
      userId,
      type: "deposit",
      amount,
      status: "success",
    });
    res.json({ balance: balance.balance });
  } catch (err) {
    next(err);
  }
};

// Withdraw money
export const withdraw = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    let balance = await Balance.findOne({ userId });
    if (!balance) {
      balance = await Balance.create({ userId, balance: 0 });
    }
    if (balance.balance < amount) {
      await Transaction.create({
        userId,
        type: "withdraw",
        amount,
        status: "failed",
      });
      return res.status(400).json({ error: "Insufficient balance" });
    }
    balance.balance -= amount;
    await balance.save();
    await Transaction.create({
      userId,
      type: "withdraw",
      amount,
      status: "success",
    });
    res.json({ balance: balance.balance });
  } catch (err) {
    next(err);
  }
};

// Get transaction history
export const getTransactions = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const transactions = await Transaction.find({ userId }).sort({
      createdAt: -1,
    });
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
};
