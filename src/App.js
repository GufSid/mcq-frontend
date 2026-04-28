import React, { useEffect, useState } from "react";
import axios from "axios";
import { useSearchParams } from 'react-router-dom';

function App() {
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId');
  const examId = searchParams.get('examId');
  const API_BASE_URL = `http://${window.location.hostname}:5001`;

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState(null);
  const [allowed, setAllowed] = useState(true);
  const [message, setMessage] = useState("");
  const [isEarly, setIsEarly] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [violationCount, setViolationCount] = useState(0);

  // 1. Initial Load & Recovery
  useEffect(() => {
    if (!userId || !examId) return;
    axios.get(`${API_BASE_URL}/api/exam/start`, { params: { userId, examId } })
      .then(res => {
        if (res.data.early) { setIsEarly(true); setStartTime(res.data.startTime); }
        else if (res.data.allowed === false) { setAllowed(false); setMessage(res.data.message); }
        else {
          if (res.data.completed) setResult(res.data);
          if (res.data.previousAnswers) setAnswers(res.data.previousAnswers);
        }
      });
  }, [userId, examId, API_BASE_URL]);

  // 2. Fetch Questions
  useEffect(() => {
    if (!allowed || isEarly || !userId || !examId) return;
    axios.get(`${API_BASE_URL}/api/questions/exam`, { params: { examId } })
      .then(res => setQuestions(res.data));
  }, [allowed, isEarly, userId, examId, API_BASE_URL]);

  // 3. Timer Sync
  useEffect(() => {
    if (result || !allowed || !userId || !examId || isEarly) return;
    const interval = setInterval(() => {
      axios.get(`${API_BASE_URL}/api/exam/time`, { params: { userId, examId } })
        .then(res => {
          setTimeLeft(res.data.secondsLeft);
          if (res.data.secondsLeft <= 0 && !result) handleAutoSubmit();
        });
    }, 1000);
    return () => clearInterval(interval);
  }, [userId, examId, result, allowed, isEarly, API_BASE_URL]);

  // 🛡️ 4. ANTI-CHEATING LOGIC
  useEffect(() => {
    if (result || !allowed || isEarly) return;

    const reportViolation = () => {
      setViolationCount(prev => {
        const next = prev + 1;
        axios.post(`${API_BASE_URL}/api/exam/log-violation`, { userId, examId });

        if (next >= 3) {
          alert("⚠️ EXAM TERMINATED: Multiple security violations detected.");
          handleAutoSubmit();
        } else {
          alert(`🚨 WARNING (${next}/3): Tab switching or clicking away is NOT allowed. Your exam will be auto-submitted after 3 violations.`);
        }
        return next;
      });
    };

    const handleVisibility = () => { if (document.hidden) reportViolation(); };
    const handleBlur = () => reportViolation();

    // Prevent Right Click, Copy, and Paste
    const preventAction = (e) => { e.preventDefault(); alert("Action Restricted for Security!"); };

    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("contextmenu", preventAction);
    document.addEventListener("copy", preventAction);
    document.addEventListener("paste", preventAction);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("contextmenu", preventAction);
      document.removeEventListener("copy", preventAction);
      document.removeEventListener("paste", preventAction);
    };
  }, [result, allowed, isEarly, userId, examId]);

  const handleOptionChange = (qId, optionKey) => {
    const updated = { ...answers };
    updated[qId] === optionKey ? delete updated[qId] : updated[qId] = optionKey;
    setAnswers(updated);
    setIsSaving(true);
    axios.post(`${API_BASE_URL}/api/submission/save-progress`, {
      userId, examId, questionId: qId, selectedOption: updated[qId] || ""
    }).then(() => setTimeout(() => setIsSaving(false), 500));
  };

  const handleAutoSubmit = () => {
    axios.post(`${API_BASE_URL}/api/submission/submit`, { userId, examId, answers })
      .then(res => setResult(res.data));
  };

  const handleSubmit = () => {
    if (window.confirm("Are you sure you want to submit?")) handleAutoSubmit();
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // RENDERING
  if (!userId || !examId) return <div style={styles.errorScreen}><h2>⚠️ Missing Credentials</h2></div>;
  if (!allowed) return <div style={styles.errorScreen}><h2>🚫 {message || "Session Expired"}</h2></div>;
  if (isEarly) return (
    <div style={styles.container}>
      <div style={styles.waitingCard}>
        <h2>⏳ Exam Not Started</h2>
        <div style={styles.timeBadge}>{new Date(startTime).toLocaleTimeString()}</div>
        <button onClick={() => window.location.reload()} style={styles.secondaryButton}>Check Again</button>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div><h2>📝 Exam Portal</h2><small>User: {userId} | Violations: {violationCount}/3</small></div>
        {isSaving && <span style={styles.saveIndicator}>☁️ Saved</span>}
      </div>

      {!result && (
        <div style={styles.timerContainer}>
          <h3 style={{...styles.timer, background: violationCount > 0 ? '#e67e22' : '#dc3545'}}>⏱ {formatTime(timeLeft)}</h3>
        </div>
      )}

      {result ? (
        <div style={styles.resultBox}>
            <h2 style={{ color: "#27ae60" }}>🎊 Exam Completed!</h2>
            <div style={styles.scoreCircle}>
                <span style={{ fontSize: "32px", fontWeight: "bold", color: "#27ae60" }}>{result.score}</span>
                <span style={{ fontSize: "12px", color: "#666" }}>SCORE</span>
            </div>
            <div style={styles.statsGrid}>
                <div style={styles.statCard}><span style={styles.statLabel}>Attempted</span><span style={styles.statValue}>{result.attempted}</span></div>
                <div style={styles.statCard}><span style={styles.statLabel}>Correct</span><span style={{...styles.statValue, color: '#2ecc71'}}>{result.correctCount}</span></div>
                <div style={styles.statCard}><span style={styles.statLabel}>Violations</span><span style={{...styles.statValue, color: '#e74c3c'}}>{violationCount}</span></div>
            </div>
        </div>
      ) : (
        <>
          {questions.map((q, i) => (
            <div key={q.id} style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h3>{i + 1}. {q.question}</h3>
                {answers[q.id] && <button onClick={() => handleOptionChange(q.id, answers[q.id])} style={styles.clearBtn}>Clear</button>}
              </div>
              {q.image && <img src={`${API_BASE_URL}${q.image}`} style={styles.image} alt="Q" />}
              <div style={styles.optionsGrid}>
                {q.options.map(opt => (
                  <label key={opt.id} style={{ ...styles.option, ...(answers[q.id] === opt.optionKey ? styles.optionSelected : {}) }}>
                    <input type="radio" checked={answers[q.id] === opt.optionKey} onChange={() => handleOptionChange(q.id, opt.optionKey)} style={{marginRight: "10px"}} />
                    <span><b>{opt.optionKey}.</b> {opt.text}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button style={styles.button} onClick={handleSubmit}>Submit Exam</button>
        </>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: "850px", margin: "auto", padding: "20px", background: "#f4f7f9", minHeight: "100vh", fontFamily: "'Segoe UI', sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #ddd", paddingBottom: "10px", marginBottom: "20px" },
  saveIndicator: { fontSize: '12px', color: '#27ae60', fontWeight: 'bold' },
  timerContainer: { position: "sticky", top: "10px", zIndex: 100, textAlign: "center" },
  timer: { color: "#fff", background: "#e74c3c", padding: "10px 25px", borderRadius: "30px", display: "inline-block", boxShadow: "0 4px 10px rgba(0,0,0,0.2)" },
  card: { background: "#fff", padding: "20px", marginTop: "20px", borderRadius: "12px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" },
  optionsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px", marginTop: "15px" },
  option: { display: "flex", alignItems: "center", padding: "12px", borderRadius: "8px", border: "1px solid #eee", cursor: "pointer", background: "#fdfdfd" },
  optionSelected: { border: "2px solid #007bff", background: "#eef6ff" },
  image: { maxWidth: "100%", borderRadius: "8px", margin: "15px 0" },
  optionImage: { height: "50px", borderRadius: "4px", marginLeft: "10px" },
  button: { width: "100%", padding: "16px", marginTop: "30px", background: "linear-gradient(135deg, #2ecc71, #27ae60)", color: "#fff", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", fontSize: "18px" },
  resultBox: { background: "#fff", padding: "30px", borderRadius: "15px", textAlign: "center", boxShadow: "0 10px 25px rgba(0,0,0,0.1)", borderTop: "6px solid #2ecc71" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "15px", marginTop: "25px" },
  statCard: { padding: "15px", borderRadius: "10px", background: "#f8f9fa", border: "1px solid #eee" },
  statLabel: { fontSize: "11px", color: "#666", textTransform: "uppercase", display: "block" },
  statValue: { fontSize: "24px", fontWeight: "bold", display: "block", marginTop: "5px" },
  scoreCircle: { width: "120px", height: "120px", borderRadius: "50%", border: "8px solid #2ecc71", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", margin: "0 auto 15px", background: "#f0fff4" },
  waitingCard: { background: "#fff", padding: "50px", borderRadius: "20px", textAlign: "center", marginTop: "60px", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" },
  timeBadge: { display: "inline-block", background: "#fff9e6", color: "#d4ac0d", padding: "15px 35px", borderRadius: "50px", fontWeight: "bold", fontSize: "24px" },
  secondaryButton: { padding: "10px 20px", cursor: "pointer", background: "#fff", border: "1px solid #ddd", borderRadius: "5px" },
  errorScreen: { textAlign: "center", marginTop: "120px", color: "#666" },
  clearBtn: { background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }
};

export default App;
