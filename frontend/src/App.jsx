import { useState } from "react"

export default function App() {
  const [resume, setResume] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [result, setResult] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const analyze = async () => {
    setLoading(true)
    setError("")
    setResult("")
    try {
      const response = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, job_description: jobDescription }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail)
      setResult(data.result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem" }}>
      <h1>Resume Match AI</h1>
      <p>Paste your resume and a job description to get an AI-powered match analysis.</p>

      <div style={{ marginBottom: "1rem" }}>
        <label><strong>Your Resume</strong></label>
        <textarea
          rows={10}
          style={{ width: "100%", marginTop: "0.5rem" }}
          placeholder="Paste your resume here..."
          value={resume}
          onChange={(e) => setResume(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label><strong>Job Description</strong></label>
        <textarea
          rows={10}
          style={{ width: "100%", marginTop: "0.5rem" }}
          placeholder="Paste the job description here..."
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
        />
      </div>

      <button
        onClick={analyze}
        disabled={loading}
        style={{ padding: "0.75rem 2rem", fontSize: "1rem", cursor: "pointer" }}
      >
        {loading ? "Analyzing..." : "Analyze Match"}
      </button>

      {error && <p style={{ color: "red", marginTop: "1rem" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: "2rem", whiteSpace: "pre-wrap", background: "#f4f4f4", padding: "1rem", borderRadius: "8px" }}>
          {result}
        </div>
      )}
    </div>
  )
}