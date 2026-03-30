const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    topic: {
      type:     String,
      required: true,
      unique:   true,
      trim:     true,
      validate: {
        validator: (v) => v.startsWith('/data/'),
        message:   'topic must start with /data/ (e.g. /data/AccountChangeEvent)',
      },
    },
    label: {
      type:     String,
      required: true,
      trim:     true,
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
    createdBy: {
      type: String,
    },
  },
  {
    timestamps: true,   // adds createdAt, updatedAt automatically
  }
);

function formatSubscription(doc) {
  return {
    id:        doc._id,
    topic:     doc.topic,
    label:     doc.label,
    isActive:  doc.isActive,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = { Subscription, formatSubscription };