const express      = require('express');
const { Subscription, formatSubscription } = require('../models/subscription');
const { requireUserToken, requireRole }    = require('../middleware');

const router = express.Router();

// All subscription routes require a valid token + admin role
router.use(requireUserToken);
router.use(requireRole('admin'));

// -----------------------------------------------
// GET /subscriptions
// List all subscriptions with optional ?isActive=true/false filter
// -----------------------------------------------
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }

    const subscriptions = await Subscription.find(filter).sort({ createdAt: -1 });
    res.json({
      subscriptions: subscriptions.map(formatSubscription),
      total: subscriptions.length,
    });
  } catch (err) {
    console.error('❌ GET /subscriptions error:', err.message);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// -----------------------------------------------
// GET /subscriptions/:id
// -----------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ error: `Subscription '${req.params.id}' not found` });
    res.json({ subscription: formatSubscription(sub) });
  } catch (err) {
    console.error('❌ GET /subscriptions/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// -----------------------------------------------
// POST /subscriptions
// Create a new CDC topic subscription
// Body: { topic, label, isActive? }
// -----------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { topic, label, isActive = true } = req.body;

    if (!topic) return res.status(400).json({ error: 'topic is required' });
    if (!label) return res.status(400).json({ error: 'label is required' });

    const existing = await Subscription.findOne({ topic });
    if (existing) {
      return res.status(409).json({ error: `Subscription for topic '${topic}' already exists` });
    }

    const sub = await Subscription.create({
      topic,
      label,
      isActive,
      createdBy: req.user.username || req.user.clientId,
    });

    console.log(`✅ Subscription created: ${topic}`);

    // Signal CDC subscriber to reload with the new topic list
    await req.reloadCDCSubscriber();

    res.status(201).json({ subscription: formatSubscription(sub) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('❌ POST /subscriptions error:', err.message);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// -----------------------------------------------
// PUT /subscriptions/:id
// Update label, isActive, or topic
// Body: { topic?, label?, isActive? }
// -----------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    const { topic, label, isActive } = req.body;
    const updates = {};
    if (topic     !== undefined) updates.topic    = topic;
    if (label     !== undefined) updates.label    = label;
    if (isActive  !== undefined) updates.isActive = isActive;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update. Provide topic, label, or isActive.' });
    }

    const sub = await Subscription.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!sub) return res.status(404).json({ error: `Subscription '${req.params.id}' not found` });

    console.log(`✅ Subscription updated: ${sub.topic} — isActive: ${sub.isActive}`);

    // Signal CDC subscriber to reload with the updated topic list
    await req.reloadCDCSubscriber();

    res.json({ subscription: formatSubscription(sub) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('❌ PUT /subscriptions/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// -----------------------------------------------
// DELETE /subscriptions/:id
// -----------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const sub = await Subscription.findByIdAndDelete(req.params.id);
    if (!sub) return res.status(404).json({ error: `Subscription '${req.params.id}' not found` });

    console.log(`✅ Subscription deleted: ${sub.topic}`);

    // Signal CDC subscriber to reload without the deleted topic
    await req.reloadCDCSubscriber();

    res.json({ message: 'Subscription deleted', subscription: formatSubscription(sub) });
  } catch (err) {
    console.error('❌ DELETE /subscriptions/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

module.exports = router;