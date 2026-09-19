import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "../App.tsx"
import { ThemeProvider } from "../lib/theme"
import "../index.css"

const root = document.getElementById("root")
if (!root) {
  throw new Error("#root not found")
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
