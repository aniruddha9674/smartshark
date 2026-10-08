

export const ALLOWED_EVENTS = {
  // ─── Pitch discovery ──────────────────────────────────────────
  pitch_viewed: {
    version: 1,
    requiredFields: ["source"],
    purpose: "Recently viewed UI + engagement analytics + ranker positive signal",
    retention: "forever",
  },
  pitch_shortlisted: {
    version: 1,
    requiredFields: [],
    purpose: "Ranker positive label + pitch popularity",
    retention: "forever",
  },
  pitch_dismissed: {
    version: 1,
    requiredFields: [],
    purpose: "Ranker negative label",
    retention: "forever",
  },
  pitch_offered: {
    version: 1,
    requiredFields: [],
    purpose: "Strongest positive signal for ranker + funnel conversion",
    retention: "forever",
  },

  // ─── Pitch lifecycle ──────────────────────────────────────────
  pitch_published: {
    version: 1,
    requiredFields: [],
    purpose: "Business dashboard 'your pitches' + publish funnel metrics",
    retention: "forever",
  },
  pitch_closed: {
    version: 1,
    requiredFields: [],
    purpose: "Pitch lifecycle tracking",
    retention: "forever",
  },

  // ─── Offers ───────────────────────────────────────────────────
  offer_created: {
    version: 1,
    requiredFields: [],
    purpose: "Investor activity feed + notification trigger",
    retention: "forever",
  },
  offer_accepted: {
    version: 1,
    requiredFields: [],
    purpose: "Deal closure analytics + training label",
    retention: "forever",
  },

  // ─── Search ───────────────────────────────────────────────────
  search_performed: {
    version: 1,
    requiredFields: ["query"],
    purpose: "Search analytics + query understanding + future autocomplete",
    retention: "90 days",
  },

  // ─── Onboarding ───────────────────────────────────────────────
  onboarding_step_completed: {
    version: 1,
    requiredFields: ["step", "stepName"],
    purpose: "Onboarding funnel analysis + drop-off detection",
    retention: "forever",
  },
  onboarding_completed: {
    version: 1,
    requiredFields: [],
    purpose: "User acquisition metric + funnel conversion",
    retention: "forever",
  },

    // ─── Offers (extend) ──────────────────────────────────────────
  offer_rejected: {
    version: 1,
    requiredFields: [],
    purpose: "Investment funnel: created → accepted vs rejected rate",
    retention: "forever",
  },
  offer_countered: {
    version: 1,
    requiredFields: [],
    purpose: "Negotiation depth analytics",
    retention: "forever",
  },

  // ─── Follows ──────────────────────────────────────────────────
  follow_created: {
    version: 1,
    requiredFields: [],
    purpose: "Follower growth analytics + future feed ranking signal",
    retention: "forever",
  },

  // ─── Messages ─────────────────────────────────────────────────
  message_sent: {
    version: 1,
    requiredFields: [],
    purpose: "Conversation activity + engagement scoring",
    retention: "forever",
  },

  // ─── Auth ─────────────────────────────────────────────────────
  user_registered: {
    version: 1,
    requiredFields: [],
    purpose: "Acquisition funnel — top of funnel",
    retention: "forever",
  },
    verification_started: {
    version: 1,
    requiredFields: [],
    purpose: "Verification funnel: how many uploads start",
    retention: "forever",
  },
  verification_extracted: {
    version: 1,
    requiredFields: [],
    purpose: "OCR performance analytics + paper training data",
    retention: "forever",
  },
  verification_applied: {
    version: 1,
    requiredFields: [],
    purpose: "User-confirmed OCR accuracy signal",
    retention: "forever",
  },
  verification_tier_changed: {
    version: 1,
    requiredFields: [],
    purpose: "Trust tier progression analytics",
    retention: "forever",
  },
  verification_failed: {
    version: 1,
    requiredFields: [],
    purpose: "Failure analysis + retry decisions",
    retention: "forever",
  },
};



export const validateEventType = (eventType) => {
  const spec = ALLOWED_EVENTS[eventType];
  if (!spec) {
    throw new Error(`Unknown event type: "${eventType}"`);
  }
  return spec;
};

export const validateMetadata = (eventType, metadata) => {
  const spec = ALLOWED_EVENTS[eventType];
  if (!spec || !spec.requiredFields.length) return;

  if (!metadata || typeof metadata !== "object") {
    throw new Error(
      `Event "${eventType}" requires metadata with fields: ${spec.requiredFields.join(", ")}`
    );
  }

  const missing = spec.requiredFields.filter((f) => metadata[f] === undefined);
  if (missing.length) {
    throw new Error(
      `Event "${eventType}" missing required fields: ${missing.join(", ")}`
    );
  }
};

