export const INTENT_CLASSES = [
  { name: "audio_generation",    color: "#f59e0b", description: "Creating music, sound effects, voice, or audio content" },
  { name: "code",                color: "#3b82f6", description: "Writing, debugging, explaining, or reviewing code" },
  { name: "document_edit",       color: "#8b5cf6", description: "Editing, improving, or rewriting existing text/documents" },
  { name: "document_generation", color: "#6366f1", description: "Writing new documents, emails, reports, or articles" },
  { name: "file_analysis",       color: "#06b6d4", description: "Analyzing uploaded files, CSVs, PDFs, or data" },
  { name: "generate_spreadsheet",color: "#22c55e", description: "Creating tables, spreadsheets, or structured data" },
  { name: "image_edit",          color: "#ec4899", description: "Editing, modifying, or enhancing existing images" },
  { name: "image_generation",    color: "#f97316", description: "Creating new images, illustrations, or artwork" },
  { name: "low_effort",          color: "#94a3b8", description: "Simple greetings, basic questions, or small talk" },
  { name: "models_information",  color: "#a855f7", description: "Questions about AI models, capabilities, or comparisons" },
  { name: "pdf_generation",      color: "#ef4444", description: "Creating or converting content to PDF format" },
  { name: "ppt_generation",      color: "#fb923c", description: "Creating presentations or slide decks" },
  { name: "reasoning",           color: "#7c6af7", description: "Complex analysis, problem-solving, or step-by-step thinking" },
  { name: "video_generation",    color: "#14b8a6", description: "Creating or generating video content or animations" },
  { name: "web_surfing",         color: "#0ea5e9", description: "Searching the web, finding current info, or browsing URLs" },
];

export const SEED_EXAMPLES: Record<string, string[]> = {
  audio_generation: [
    "Generate a podcast intro jingle",
    "Create background music for a meditation video",
    "Make a sound effect for a door opening",
    "Generate a voice narration for this script",
    "Create an upbeat background track for my ad",
    "Make a notification sound for my app",
    "Generate ambient rain sounds for studying",
  ],
  code: [
    "Write a Python function to parse JSON",
    "Debug this JavaScript code for me",
    "Explain what this function does",
    "Write a SQL query to find duplicate records",
    "Convert this Python code to TypeScript",
    "How do I reverse a string in Go?",
    "Write unit tests for this class",
    "Refactor this function to be more readable",
  ],
  document_edit: [
    "Fix the grammar in this paragraph",
    "Make this email more professional",
    "Rewrite this to be more concise",
    "Improve the tone of this message",
    "Correct the spelling mistakes in this text",
    "Make this cover letter sound better",
    "Shorten this paragraph without losing meaning",
    "Rephrase this to be more formal",
  ],
  document_generation: [
    "Write a cover letter for a software engineer role",
    "Draft a project proposal for a mobile app",
    "Write a README for my GitHub project",
    "Create a job description for a product manager",
    "Write a press release for our product launch",
    "Draft a business email to a client",
    "Write a terms of service document",
    "Create a meeting agenda for next week",
  ],
  file_analysis: [
    "Analyze this CSV and tell me the trends",
    "What does this PDF contain?",
    "Extract all the dates from this document",
    "Summarize the key points of this report",
    "Find anomalies in this data file",
    "What are the column headers in this spreadsheet?",
    "Parse the data from this uploaded file",
    "What is the total revenue in this Excel file?",
  ],
  generate_spreadsheet: [
    "Create a monthly budget spreadsheet",
    "Make a table comparing product features",
    "Generate a CSV of employee records",
    "Build a project timeline in spreadsheet format",
    "Create a sales tracking table",
    "Make a workout log spreadsheet",
    "Generate a weekly schedule table",
    "Create an inventory list in table format",
  ],
  image_edit: [
    "Remove the background from this image",
    "Make this photo brighter",
    "Add a logo watermark to this picture",
    "Crop this image to a square",
    "Change the sky in this photo to sunset",
    "Make this image black and white",
    "Blur the background of this portrait",
    "Upscale this low resolution image",
  ],
  image_generation: [
    "Draw a cat sitting on a moon",
    "Generate a logo for a coffee shop",
    "Create an illustration of a futuristic city",
    "Make an image of a mountain at sunset",
    "Generate a cartoon avatar of a robot",
    "Create a banner image for my website",
    "Draw a fantasy map of an island",
    "Generate a product photo of a sneaker",
  ],
  low_effort: [
    "Hi",
    "Hello there",
    "What time is it?",
    "What is 2 + 2?",
    "Thanks!",
    "How are you?",
    "What's your name?",
    "Okay",
    "Can you help me?",
    "Tell me a joke",
  ],
  models_information: [
    "What is GPT-4?",
    "What models does OpenAI offer?",
    "How does Claude compare to ChatGPT?",
    "What is the context window of GPT-4o?",
    "Which AI model is best for coding?",
    "What is the difference between GPT-3.5 and GPT-4?",
    "What is Gemini Ultra?",
    "How much does the OpenAI API cost?",
  ],
  pdf_generation: [
    "Convert this text to a PDF",
    "Create a printable PDF invoice",
    "Generate a PDF report from this data",
    "Make a PDF version of this document",
    "Export this as a PDF file",
    "Create a formatted PDF resume",
    "Generate a PDF with this content",
  ],
  ppt_generation: [
    "Create a PowerPoint presentation about climate change",
    "Make 5 slides summarizing this article",
    "Generate a slide deck for my product demo",
    "Create a presentation on quarterly results",
    "Make slides for my school project on space",
    "Build a pitch deck for my startup",
    "Create a training presentation for new employees",
  ],
  reasoning: [
    "Analyze the pros and cons of electric vehicles",
    "Walk me through how to solve this math problem step by step",
    "What would happen if the internet went down for a week?",
    "Help me think through this business decision",
    "Why does this logical argument not hold?",
    "Break down the causes of World War 1",
    "How should I prioritize these tasks?",
    "Reason through the trolley problem",
  ],
  video_generation: [
    "Create a short animation of a bouncing ball",
    "Generate a 10 second intro video",
    "Make a timelapse video of a plant growing",
    "Create an animated explainer video",
    "Generate a video from this script",
    "Make a product showcase video",
    "Create a looping background video",
  ],
  web_surfing: [
    "Search the web for the latest iPhone news",
    "Find the current price of Bitcoin",
    "Look up today's weather in New York",
    "What is the top story on CNN right now?",
    "Find recent research papers on AI safety",
    "What are the trending topics on Twitter today?",
    "Look up the opening hours of the Louvre",
  ],
};

export function getIntentColor(name: string): string {
  return INTENT_CLASSES.find((c) => c.name === name)?.color ?? "#7c6af7";
}

export function getIntentModel(intentName: string): string {
  switch (intentName) {
    case "image_generation":
    case "image_edit":
      return "gpt-image-1";
    case "reasoning":
      return "o3-mini";
    case "low_effort":
      return "gpt-4o-mini";
    default:
      return "gpt-4o";
  }
}
