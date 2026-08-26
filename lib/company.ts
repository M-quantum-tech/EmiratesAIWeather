export type IconName =
  | "atom"
  | "cpu"
  | "shield-check"
  | "users"
  | "sparkles"
  | "house"
  | "shirt"
  | "radar"
  | "bell"
  | "wind"
  | "plane"
  | "map-pinned"
  | "compass"

export type Pillar = {
  icon: IconName
  title: string
  body: string
}

export type ModuleFeature = {
  icon: IconName
  title: string
  body: string
}

export type PlatformModule = {
  index: string
  title: string
  summary: string
  features: ModuleFeature[]
}

export const COMPANY = {
  name: "M-Quantum-Tech",
  tagline: "Advanced Quantum Solutions",
  founder: "Malik Basha Shaik",
  founderRole: "Founder & Lead Technology Engineer",
  intro:
    "M-Quantum-Tech is a pioneering technology enterprise at the forefront of the quantum revolution. Built on a rare fusion of cutting-edge scientific innovation and absolute ethical integrity, the company is reshaping the future of high-performance computing, secure communications, and advanced digital infrastructure.",
  founderStatement:
    "M-Quantum-Tech is the direct reflection of its founder, Malik Basha Shaik. Widely respected throughout the technology sector as an elite engineer of profound intellect, Shaik is equally celebrated for his exceptional moral character and principled leadership. His deep technical expertise drives the company's aggressive research and development, while his unwavering commitment to high morality ensures that M-Quantum-Tech operates with total transparency, corporate responsibility, and human-centric values.",
  founderClose:
    "Under his stewardship, the company doesn't just build powerful technology — it builds technology you can trust.",
} as const

export const PILLARS: Pillar[] = [
  {
    icon: "atom",
    title: "Next-Generation Quantum Solutions",
    body: "Architecting scalable quantum computing frameworks designed to solve complex global challenges in optimization, data analysis, and predictive modeling.",
  },
  {
    icon: "cpu",
    title: "Advanced Engineering Support",
    body: "Delivering world-class technical support, system integration, and robust infrastructure built to withstand the demands of tomorrow's digital landscape.",
  },
  {
    icon: "shield-check",
    title: "Ethical & Responsible Tech",
    body: "Pioneering a development model where data privacy, algorithmic fairness, and societal well-being are hardcoded into every technological breakthrough.",
  },
  {
    icon: "users",
    title: "A Culture of Integrity",
    body: "Fostering an elite global ecosystem of scientists and engineers who value character as much as capability, creating a collaborative space for meaningful innovation.",
  },
]

export const PLATFORM_INTRO =
  "EmiratesAIWeather is a groundbreaking digital platform engineered to transform how the public interacts with, prepares for, and thrives within the unique climate of the United Arab Emirates. By seamlessly blending hyper-local atmospheric data with advanced artificial intelligence, this platform serves as an essential lifestyle companion — empowering both UAE residents and the global Emirati community to optimize their daily routines, safeguard their health, and enhance their overall quality of life."

export const MODULES: PlatformModule[] = [
  {
    index: "01",
    title: "Smart Lifestyle Optimization",
    summary: "Tailoring daily life to the shifting desert climate to maximize comfort, productivity, and leisure.",
    features: [
      {
        icon: "sparkles",
        title: "AI Activity Planner",
        body: "Recommends the best times for outdoor fitness, dining, or family outings based on real-time heat indices, UV exposure, and wind patterns.",
      },
      {
        icon: "house",
        title: "Smart Home Integration",
        body: "Synchronizes with home automation to optimize cooling, reduce energy footprints, and prepare households for sudden dust storms or temperature spikes.",
      },
      {
        icon: "shirt",
        title: "Wardrobe & Comfort Advisor",
        body: "Suggests optimal clothing choices and hydration targets based on shifting humidity and ambient temperature metrics.",
      },
    ],
  },
  {
    index: "02",
    title: "Precision Weather Analysis & Predictive Safety",
    summary: "Moving beyond traditional forecasting to deliver highly contextualized, actionable environmental data.",
    features: [
      {
        icon: "radar",
        title: "Micro-Climate Tracking",
        body: "Provides hyper-local updates specific to individual neighborhoods, coastal zones, and mountain terrains across all seven emirates.",
      },
      {
        icon: "bell",
        title: "Early Warning Systems",
        body: "Delivers instant, AI-driven alerts for high-impact events like heavy fog, sandstorms, and flash floods, ensuring public safety and transit readiness.",
      },
      {
        icon: "wind",
        title: "Air Quality Index Mapping",
        body: "Tracks particulate matter, dust density, and allergen levels to protect sensitive groups and support respiratory health.",
      },
    ],
  },
  {
    index: "03",
    title: "Connecting the Global UAE Community",
    summary: "Extending the warmth and safety of the Emirates to citizens, expats, and travelers wherever they are.",
    features: [
      {
        icon: "plane",
        title: "Global Emirati Travel Companion",
        body: "Assists UAE nationals traveling or living abroad with climate transitions, travel packing guides, and localized weather safety advice.",
      },
      {
        icon: "map-pinned",
        title: "Inbound Tourism Concierge",
        body: "Helps global travelers plan visits by identifying ideal seasonal windows, booking outdoor excursions, and navigating regional weather norms.",
      },
      {
        icon: "compass",
        title: "Cross-Border Community Hub",
        body: "Fosters an interconnected space where users share real-time crowd insights, weather-related event adjustments, and local lifestyle tips.",
      },
    ],
  },
]

export const STRATEGIC_IMPACT =
  "By turning complex meteorological data into accessible, lifestyle-centric guidance, EmiratesAIWeather directly supports the UAE's vision of building a happier, healthier, and more sustainable society. It bridges the gap between scientific analysis and everyday human needs, setting a new global standard for community-focused climate technology."
