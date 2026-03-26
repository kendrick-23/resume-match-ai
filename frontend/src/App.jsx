import { useState, useEffect, useRef } from "react"

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');`

function ScoreRing({ score }) {
  const [displayed, setDisplayed] = useState(0)
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (displayed / 100) * circumference
  const color = score >= 70 ? "#f0b429" : score >= 40 ? "#fb923c" : "#ef4444"

  useEffect(() => {
    let start = null
    const duration = 1200
    const step = (timestamp) => {
      if (!start) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(ease * score))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [score])

  const label = score >= 70 ? "Strong Match" : score >= 40 ? "Partial Match" : "Weak Match"

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#1c1c1c" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={radius} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: "stroke-dashoffset 0.05s linear" }}
        />
        <text x="70" y="64" textAnchor="middle" fill={color} fontSize="28" fontWeight="700" fontFamily="'JetBrains Mono', monospace">{displayed}</text>
        <text x="70" y="82" textAnchor="middle" fill="#555" fontSize="11" fontFamily="'DM Sans', sans-serif">/100</text>
      </svg>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", color, textTransform: "uppercase", letterSpacing: "0.15em" }}>{label}</span>
    </div>
  )
}

function Section({ icon, label, items, accentColor }) {
  return (
    <div style={{ borderLeft: `3px solid ${accentColor}`, paddingLeft: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: accentColor, textTransform: "uppercase", letterSpacing: "0.15em" }}>{icon} {label}</span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {items.map((item, i) => (
          <li key={i} style={{ color: "#a1a1a1", fontSize: "0.875rem", lineHeight: "1.7", fontFamily: "'DM Sans', sans-serif", fontWeight: "300" }}>
            <span style={{ color: accentColor, marginRight: "0.5rem", fontFamily: "'JetBrains Mono', monospace" }}>—</span>
            {item.replace(/^[-•]\s*/, "")}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function App() {
  const [resume, setResume] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const resultsRef = useRef(null)
  const fileInputRef = useRef(null)

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Client-side validation before sending to the server
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
    if (!allowedTypes.includes(file.type)) {
      setError("Only PDF and Word (.docx) files are accepted.")
      e.target.value = ""
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large. Maximum size is 5 MB.")
      e.target.value = ""
      return
    }

    setUploading(true)
    setError("")

    // FormData is the browser's way of sending files over HTTP.
    // It packages the file as multipart/form-data — the same encoding
    // an HTML <form> with enctype="multipart/form-data" would use.
    const formData = new FormData()
    formData.append("file", file)

    try {
      const response = await fetch("http://127.0.0.1:8000/upload-resume", {
        method: "POST",
        body: formData,
        // No Content-Type header — the browser sets it automatically
        // with the correct multipart boundary string
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail)

      setResume(data.text)
      setUploadedFile(data.filename)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const clearUploadedFile = () => {
    setUploadedFile(null)
    setResume("")
  }

  const analyze = async () => {
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const response = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, job_description: jobDescription }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail)
      const parsed = parseResult(data.result)
      setResult(parsed)
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const parseResult = (text) => {
    const sections = {}
    const scoreMatch = text.match(/MATCH SCORE:\s*(\d+)/)
    if (scoreMatch) sections.score = parseInt(scoreMatch[1])
    const strengthsMatch = text.match(/STRENGTHS:([\s\S]*?)(?=GAPS:|$)/)
    if (strengthsMatch) sections.strengths = strengthsMatch[1].trim().split("\n").filter(l => l.trim())
    const gapsMatch = text.match(/GAPS:([\s\S]*?)(?=RECOMMENDATIONS:|$)/)
    if (gapsMatch) sections.gaps = gapsMatch[1].trim().split("\n").filter(l => l.trim())
    const recsMatch = text.match(/RECOMMENDATIONS:([\s\S]*?)(?=SUMMARY:|$)/)
    if (recsMatch) sections.recommendations = recsMatch[1].trim().split("\n").filter(l => l.trim())
    const summaryMatch = text.match(/SUMMARY:([\s\S]*?)$/)
    if (summaryMatch) sections.summary = summaryMatch[1].trim()
    return sections
  }

  const canAnalyze = resume.trim() && jobDescription.trim() && !loading

  return (
    <>
      <style>{FONTS}{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080808; }
        textarea { font-family: 'DM Sans', sans-serif !important; }
        textarea:focus { outline: none; border-color: #f0b429 !important; }
        textarea::placeholder { color: #2a2a2a; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-up { animation: fadeUp 0.5s ease forwards; opacity: 0; }
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.2s; }
        .delay-3 { animation-delay: 0.3s; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#080808", color: "#e0e0e0" }}>

        {/* Top bar */}
        <div style={{ borderBottom: "1px solid #141414", padding: "1rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "rgba(8,8,8,0.95)", backdropFilter: "blur(12px)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ width: "28px", height: "28px", border: "1.5px solid #f0b429", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1L9.5 5.5H12.5L10 8.5L11 13L7 10.5L3 13L4 8.5L1.5 5.5H4.5L7 1Z" stroke="#f0b429" strokeWidth="1.2" fill="none"/>
              </svg>
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: "700", fontSize: "0.95rem", letterSpacing: "-0.02em" }}>resume-match-ai</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "#3a3a3a", letterSpacing: "0.1em" }}>POWERED BY CLAUDE</span>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
          </div>
        </div>

        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "4rem 2rem 6rem" }}>

          {/* Hero */}
          <div style={{ marginBottom: "4rem" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "#f0b429", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1.5rem" }}>
              AI-Powered Resume Analysis
            </div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: "800", fontSize: "clamp(2.5rem, 5vw, 4rem)", lineHeight: "1.05", letterSpacing: "-0.04em", color: "#f5f5f5", marginBottom: "1.25rem" }}>
              Match your resume<br />
              <span style={{ color: "#3a3a3a" }}>to any job.</span>
            </h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: "300", color: "#555", fontSize: "1.05rem", maxWidth: "480px", lineHeight: "1.7" }}>
              Upload your resume or paste it in, add a job description, and get a precise match score, gap analysis, and actionable recommendations in seconds.
            </p>
          </div>

          {/* Input grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>

            {/* Resume column */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "#3a3a3a", letterSpacing: "0.2em" }}>01 — YOUR RESUME</label>
                {/* Hidden file input — we trigger it via the visible button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.4rem",
                    padding: "0.35rem 0.75rem",
                    background: "transparent",
                    border: "1px solid #1c1c1c",
                    borderRadius: "6px",
                    color: uploading ? "#3a3a3a" : "#777",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.6rem",
                    letterSpacing: "0.05em",
                    cursor: uploading ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {uploading
                    ? <><span style={{ display: "inline-block", width: "10px", height: "10px", border: "1.5px solid #333", borderTopColor: "#f0b429", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Extracting...</>
                    : <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3-3 3 3M2 9h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg> Upload PDF / DOCX</>
                  }
                </button>
              </div>

              {/* File status badge */}
              {uploadedFile && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  marginBottom: "0.5rem", padding: "0.4rem 0.75rem",
                  background: "#0d1a0d", border: "1px solid #1a2e1a",
                  borderRadius: "6px",
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "#22c55e" }}>
                    Extracted from: {uploadedFile}
                  </span>
                  <button
                    onClick={clearUploadedFile}
                    style={{
                      background: "none", border: "none", color: "#555",
                      cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.7rem", padding: "0 0.25rem",
                    }}
                  >
                    x
                  </button>
                </div>
              )}

              <textarea
                rows={16}
                style={{ width: "100%", background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "8px", color: "#d0d0d0", padding: "1.25rem", fontSize: "0.825rem", resize: "vertical", lineHeight: "1.7", transition: "border-color 0.2s" }}
                placeholder="Paste your resume here or upload a file..."
                value={resume}
                onChange={(e) => { setResume(e.target.value); if (uploadedFile) setUploadedFile(null) }}
              />
            </div>

            {/* Job description column */}
            <div>
              <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "#3a3a3a", letterSpacing: "0.2em", marginBottom: "0.75rem" }}>02 — JOB DESCRIPTION</label>
              <textarea
                rows={16}
                style={{ width: "100%", background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "8px", color: "#d0d0d0", padding: "1.25rem", fontSize: "0.825rem", resize: "vertical", lineHeight: "1.7", transition: "border-color 0.2s" }}
                placeholder="Paste the job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
            </div>

          </div>

          {/* Analyze button */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "4rem" }}>
            <button
              onClick={analyze}
              disabled={!canAnalyze}
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.875rem 2rem",
                background: canAnalyze ? "#f0b429" : "#141414",
                color: canAnalyze ? "#080808" : "#2a2a2a",
                border: "none", borderRadius: "8px",
                fontFamily: "'Syne', sans-serif", fontWeight: "700", fontSize: "0.9rem",
                cursor: canAnalyze ? "pointer" : "not-allowed",
                transition: "all 0.2s", letterSpacing: "-0.01em"
              }}
            >
              {loading
                ? <><span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid #555", borderTopColor: "#f0b429", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Analyzing…</>
                : <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L9.5 5.5H12.5L10 8.5L11 13L7 10.5L3 13L4 8.5L1.5 5.5H4.5L7 1Z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg> Analyze Match</>
              }
            </button>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: canAnalyze ? "#3a3a3a" : "#222" }}>
              {!resume.trim() || !jobDescription.trim() ? "Paste both fields to continue" : "Ready to analyze"}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={{ border: "1px solid #3f1010", background: "#1a0808", borderRadius: "8px", padding: "1rem 1.25rem", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", marginBottom: "2rem" }}>
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div ref={resultsRef} style={{ borderTop: "1px solid #141414", paddingTop: "3rem" }}>

              {/* Score row */}
              <div className="fade-up" style={{ display: "flex", alignItems: "center", gap: "3rem", marginBottom: "3.5rem", paddingBottom: "3rem", borderBottom: "1px solid #141414" }}>
                <ScoreRing score={result.score ?? 0} />
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "#3a3a3a", letterSpacing: "0.2em", marginBottom: "0.75rem" }}>ANALYSIS COMPLETE</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: "800", fontSize: "1.75rem", letterSpacing: "-0.04em", color: "#f5f5f5", lineHeight: 1.2 }}>
                    {result.score >= 70 ? "You're a strong candidate." : result.score >= 40 ? "Some gaps to address." : "Significant gaps identified."}
                  </div>
                  {result.summary && (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: "300", color: "#555", fontSize: "0.9rem", lineHeight: "1.7", marginTop: "0.75rem", maxWidth: "480px" }}>
                      {result.summary}
                    </p>
                  )}
                </div>
              </div>

              {/* Three columns */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3rem" }}>
                {result.strengths?.length > 0 && (
                  <div className="fade-up delay-1">
                    <Section icon="✓" label="Strengths" items={result.strengths} accentColor="#f0b429" />
                  </div>
                )}
                {result.gaps?.length > 0 && (
                  <div className="fade-up delay-2">
                    <Section icon="✕" label="Gaps" items={result.gaps} accentColor="#ef4444" />
                  </div>
                )}
                {result.recommendations?.length > 0 && (
                  <div className="fade-up delay-3">
                    <Section icon="→" label="Next Steps" items={result.recommendations} accentColor="#60a5fa" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #0f0f0f", padding: "1.5rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "#222" }}>resume-match-ai — github.com/kendrick-23</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "#222" }}>Built with FastAPI + React + Claude</span>
        </div>
      </div>
    </>
  )
}