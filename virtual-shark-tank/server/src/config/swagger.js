import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "SmartShark API",
      version: "1.0.0",
      description: "Backend API for the Virtual Shark Tank platform",
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Local development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["business", "investor", "admin"] },
            isVerified: { type: "boolean" },
            isActive: { type: "boolean" },
            isProfileComplete: { type: "boolean" },
            avatarUrl: { type: "string", nullable: true },
            language: { type: "string", example: "en" },
            theme: { type: "string", example: "system" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string", example: "Validation failed" },
            details: {
              type: "object",
              nullable: true,
              description: "Additional error context (e.g. missing fields)",
            },
          },
        },
        BusinessProfile: {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    userId: { type: "string", format: "uuid" },
    companyName: { type: "string", nullable: true },
    sector: { type: "string", nullable: true },
    city: { type: "string", nullable: true },
    description: { type: "string", nullable: true },
    udyamNumber: { type: "string", nullable: true },
    gstNumber: { type: "string", nullable: true },
    shopActLicense: { type: "string", nullable: true },
    verificationTier: {
      type: "string",
      enum: ["unverified", "basic", "verified"],
      example: "unverified",
    },
    fundingAsk: { type: "string", nullable: true, example: "5000000" },
    yearsOperating: { type: "integer", nullable: true },
  },
},
ProfileEdit: {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    businessId: { type: "string", format: "uuid" },
    editedById: { type: "string", format: "uuid", nullable: true },
    fieldName: { type: "string", example: "fundingAsk" },
    oldValue: { type: "string", nullable: true, example: "5000000" },
    newValue: { type: "string", example: "8000000" },
    fieldType: { type: "string", example: "currency" },
    changedAt: { type: "string", format: "date-time" },
  },
},
InvestorProfile: {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    userId: { type: "string", format: "uuid" },
    panNumber: { type: "string", nullable: true, example: "ABCDE1234F" },
    firmName: { type: "string", nullable: true },
    investmentFocus: { type: "string", nullable: true },
    preferredGeography: { type: "string", nullable: true },
    minTicketSize: { type: "string", nullable: true, example: "500000" },
    maxTicketSize: { type: "string", nullable: true, example: "5000000" },
    isIdentityVerified: { type: "boolean", example: false },
  },
},
Pitch: {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    businessId: { type: "string", format: "uuid" },
    title: { type: "string", example: "Seed Round 2026" },
    tagline: { type: "string", nullable: true, example: "Invest in the future of X" },
    shortPitch: { type: "string", nullable: true },
    longSummary: { type: "string", nullable: true },
    askAmount: { type: "string", example: "5000000" },
    equityOffered: { type: "string", example: "8" },
    valuation: { type: "string", example: "62500000.00" },
    stage: {
      type: "string",
      enum: ["idea", "mvp", "early_revenue", "growth", "scale"],
      nullable: true,
    },
    revenueRange: {
      type: "string",
      enum: ["pre_revenue", "under_10L", "10L_1Cr", "1Cr_10Cr", "10Cr_plus"],
      nullable: true,
    },
    monthlyGrowthPct: { type: "string", nullable: true },
    teamSize: { type: "integer", nullable: true },
    foundedYear: { type: "integer", nullable: true },
    content: {
      type: "object",
      nullable: true,
      properties: {
        problem: { type: "string" },
        solution: { type: "string" },
        marketSize: { type: "string" },
        tractionNarrative: { type: "string" },
        teamNarrative: { type: "string" },
        competition: { type: "string" },
        businessModel: { type: "string" },
        useOfFunds: { type: "string" },
        milestones: { type: "string" },
      },
    },
    videoUrl: { type: "string", nullable: true },
    pitchDeckUrl: { type: "string", nullable: true },
    coverImageUrl: { type: "string", nullable: true },
    sectorSpecificFields: { type: "object", nullable: true },
    status: {
      type: "string",
      enum: ["draft", "live", "closed", "funded", "withdrawn"],
    },
    publishedAt: { type: "string", format: "date-time", nullable: true },
    closedAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
},

PitchCreate: {
  type: "object",
  required: ["title", "askAmount", "equityOffered"],
  properties: {
    title: { type: "string", example: "Seed Round 2026" },
    tagline: { type: "string", example: "Invest in the future of X" },
    shortPitch: { type: "string", example: "We help X do Y" },
    longSummary: { type: "string" },
    askAmount: { type: "number", example: 5000000 },
    equityOffered: { type: "number", example: 8 },
    stage: { type: "string", enum: ["idea", "mvp", "early_revenue", "growth", "scale"] },
    revenueRange: {
      type: "string",
      enum: ["pre_revenue", "under_10L", "10L_1Cr", "1Cr_10Cr", "10Cr_plus"],
    },
    monthlyGrowthPct: { type: "number", example: 25 },
    teamSize: { type: "integer", example: 5 },
    foundedYear: { type: "integer", example: 2024 },
    content: {
      type: "object",
      properties: {
        problem: { type: "string" },
        solution: { type: "string" },
        marketSize: { type: "string" },
        tractionNarrative: { type: "string" },
        teamNarrative: { type: "string" },
        competition: { type: "string" },
        businessModel: { type: "string" },
        useOfFunds: { type: "string" },
        milestones: { type: "string" },
      },
    },
    videoUrl: { type: "string", format: "uri" },
    pitchDeckUrl: { type: "string", format: "uri" },
    coverImageUrl: { type: "string", format: "uri" },
    sectorSpecificFields: { type: "object" },
  },
},

PitchUpdate: {
  type: "object",
  minProperties: 1,
  properties: {
    title: { type: "string" },
    tagline: { type: "string", nullable: true },
    shortPitch: { type: "string", nullable: true },
    longSummary: { type: "string", nullable: true },
    askAmount: { type: "number" },
    equityOffered: { type: "number" },
    stage: { type: "string", nullable: true },
    revenueRange: { type: "string", nullable: true },
    monthlyGrowthPct: { type: "number", nullable: true },
    teamSize: { type: "integer", nullable: true },
    foundedYear: { type: "integer", nullable: true },
    content: { type: "object" },
    videoUrl: { type: "string", format: "uri", nullable: true },
    pitchDeckUrl: { type: "string", format: "uri", nullable: true },
    coverImageUrl: { type: "string", format: "uri", nullable: true },
    sectorSpecificFields: { type: "object", nullable: true },
  },
},
FollowedUser: {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    role: { type: "string", enum: ["business", "investor", "admin"] },
    avatarUrl: { type: "string", nullable: true },
    isProfileComplete: { type: "boolean" },
    followedAt: { type: "string", format: "date-time" },
    profile: {
      type: "object",
      nullable: true,
      description: "Business profile fields for business users, investor profile fields for investors",
    },
  },
},
Pagination: {
  type: "object",
  properties: {
    limit: { type: "integer", example: 20 },
    offset: { type: "integer", example: 0 },
    total: { type: "integer", example: 42 },
  },
},
ConversationSummary: {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    lastMessageAt: { type: "string", format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
    otherUser: {
      type: "object",
      nullable: true,
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        role: { type: "string", enum: ["business", "investor", "admin"] },
        avatarUrl: { type: "string", nullable: true },
      },
    },
    lastMessage: {
      type: "object",
      nullable: true,
      properties: {
        body: { type: "string" },
        senderId: { type: "string", format: "uuid" },
        sentByMe: { type: "boolean" },
      },
    },
    unreadCount: { type: "integer", example: 2 },
  },
},
Conversation: {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    participantAId: { type: "string", format: "uuid" },
    participantBId: { type: "string", format: "uuid" },
    lastMessageAt: { type: "string", format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
  },
},
ConversationWithUser: {
  allOf: [
    { $ref: '#/components/schemas/Conversation' },
    {
      type: "object",
      properties: {
        otherUser: {
          type: "object",
          nullable: true,
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            role: { type: "string" },
            avatarUrl: { type: "string", nullable: true },
          },
        },
      },
    },
  ],
},
Message: {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    conversationId: { type: "string", format: "uuid" },
    senderId: { type: "string", format: "uuid" },
    body: { type: "string" },
    isRead: { type: "boolean" },
    readAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
  },
},
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./src/routes/*.js"],
};

export const swaggerSpec = swaggerJsdoc(options);