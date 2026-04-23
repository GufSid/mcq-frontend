import React, { useEffect, useState } from "react";
import axios from "axios";
import { useSearchParams } from 'react-router-dom';

function App() {
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId');
  const examId = searchParams.get('examId');

  // ✅ DYNAMIC API URL: Detects localhost vs Network IP automatically
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

  // 1. Initial Auth & Progress Recovery
  useEffect(() => {
    if (!userId || !examId) return;
    axios.get(`${API_BASE_URL}/api/exam/start`, { params: { userId, examId } })
      .then(res => {
        if (res.data.early) {
          setIsEarly(true);
          setStartTime(res.data.startTime);
        } else if (res.data.allowed === false) {
          setAllowed(false);
          setMessage(res.data.message);
        } else {
          if (res.data.completed) {
            setResult(res.data);
          }
          // ✅ RECOVERY: Load saved answers from DB into local state
          if (res.data.previousAnswers) {
            setAnswers(res.data.previousAnswers);
          }
        }
      })
      .catch(err => console.error("Auth error:", err));
  }, [userId, examId, API_BASE_URL]);

  // 2. Fetch Questions (Runs always to support both Exam and Review mode)
  useEffect(() => {
    if (!allowed || isEarly || !userId || !examId) return;
    axios.get(`${API_BASE_URL}/api/questions/exam`, { params: { examId } })
      .then(res => setQuestions(res.data))
      .catch(err => console.error("Question fetch error:", err));
  }, [allowed, isEarly, userId, examId, API_BASE_URL]);

  // 3. Timer Sync
  useEffect(() => {
    if (result || !allowed || !userId || !examId || isEarly) return;
    const interval = setInterval(() => {
      axios.get(`${API_BASE_URL}/api/exam/time`, { params: { userId, examId } })
        .then(res => {
          setTimeLeft(res.data.secondsLeft);
          if (res.data.secondsLeft <= 0 && !result) handleAutoSubmit();
        })
        .catch(err => console.error("Timer error:", err));
    }, 1000);
    return () => clearInterval(interval);
  }, [userId, examId, result, allowed, isEarly, API_BASE_URL]);

  // ✅ AUTO-SAVE & CLEAR LOGIC
  const handleOptionChange = (qId, optionKey) => {
    const updatedAnswers = { ...answers };
    if (updatedAnswers[qId] === optionKey) {
      delete updatedAnswers[qId]; // Clear if clicked again
    } else {
      updatedAnswers[qId] = optionKey; // Select
    }
    setAnswers(updatedAnswers);
    setIsSaving(true);

    axios.post(`${API_BASE_URL}/api/submission/save-progress`, {
      userId, examId, questionId: qId, selectedOption: updatedAnswers[qId] || ""
    })
    .then(() => setTimeout(() => setIsSaving(false), 500))
    .catch(err => { console.error(err); setIsSaving(false); });
  };

  const handleAutoSubmit = () => {
    axios.post(`${API_BASE_URL}/api/submission/submit`, { userId, examId, answers })
      .then(res => {
        if (res.data.error) window.location.reload();
        else setResult(res.data);
      });
  };

  const handleSubmit = () => {
    if (result || !allowed) return;
    if (!window.confirm("Submit your exam?")) return;
    handleAutoSubmit();
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  if (!userId || !examId) return <div style={styles.errorScreen}><h2>⚠️ Missing Credentials</h2></div>;
  if (!allowed) return <div style={styles.errorScreen}><h2>🚫 {message || "Access Denied"}</h2></div>;

  if (isEarly) return (
    <div style={styles.container}>
      <div style={styles.waitingCard}>
        <div style={{fontSize: "60px"}}>⏳</div>
        <h2>Exam Not Started</h2>
        <div style={styles.timeBadge}>{new Date(startTime).toLocaleTimeString()}</div>
        <button onClick={() => window.location.reload()} style={styles.secondaryButton}>Check Again</button>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div><h2>📝 Exam Portal</h2><small>User: {userId} | Exam: {examId}</small></div>
        {isSaving && <span style={styles.saveIndicator}>☁️ Progress Saved</span>}
      </div>

      {!result && (
        <div style={styles.timerContainer}>
          <h3 style={styles.timer}>⏱ {formatTime(timeLeft)}</h3>
        </div>
      )}

      {result ? (
        <>
          <div style={styles.resultBox}>
            <h2 style={{ color: "#27ae60" }}>🎊 Exam Completed!</h2>
            <div style={styles.scoreCircle}>
              <span style={{ fontSize: "32px", fontWeight: "bold", color: "#27ae60" }}>{result.score}</span>
              <span style={{ fontSize: "12px", color: "#666" }}>SCORE</span>
            </div>
            <div style={styles.statsGrid}>
              <div style={styles.statCard}><span style={styles.statLabel}>Total</span><span style={styles.statValue}>{questions.length}</span></div>
              <div style={styles.statCard}><span style={styles.statLabel}>Attempted</span><span style={{ ...styles.statValue, color: "#007bff" }}>{result.attempted}</span></div>
              <div style={styles.statCard}><span style={styles.statLabel}>Correct</span><span style={{ ...styles.statValue, color: "#2ecc71" }}>{result.correctCount}</span></div>
              <div style={styles.statCard}><span style={styles.statLabel}>Wrong</span><span style={{ ...styles.statValue, color: "#e74c3c" }}>{result.wrongCount}</span></div>
            </div>
          </div>

          <h3 style={{ margin: "30px 0 15px", color: "#333" }}>🔍 Detailed Answer Review</h3>
          {questions.map((q, i) => {
            const qDetail = result.details?.find(d => d.questionId === q.id);
            return (
              <div key={q.id} style={styles.card}>
                <h3>{i + 1}. {q.question} {!qDetail?.selected && <small style={{color: "#e67e22"}}>(Skipped)</small>}</h3>
                {q.image && <img src={`${API_BASE_URL}${q.image}`} style={styles.image} alt="Q" />}
                <div style={styles.optionsGrid}>
                  {q.options.map(opt => {
                    const isCorrect = opt.optionKey === qDetail?.correctOption;
                    const isUserSelected = opt.optionKey === qDetail?.selected;
                    let bgColor = isCorrect ? "#d4edda" : (isUserSelected && !isCorrect) ? "#f8d7da" : "#fdfdfd";
                    return (
                      <div key={opt.id} style={{ ...styles.option, background: bgColor, cursor: "default" }}>
                        <span style={{flex: 1}}><b>{opt.optionKey}.</b> {opt.text} {isCorrect && "✅"} {isUserSelected && !isCorrect && "❌"}</span>
                        {opt.image && <img src={`${API_BASE_URL}${opt.image}`} style={styles.optionImage} alt="O" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <>
          {questions.map((q, i) => (
            <div key={q.id} style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>{i + 1}. {q.question}</h3>
                {answers[q.id] && <button onClick={() => handleOptionChange(q.id, answers[q.id])} style={styles.clearBtn}>Clear</button>}
              </div>
              {q.image && <img src={`${API_BASE_URL}${q.image}`} style={styles.image} alt="Q" />}
              <div style={styles.optionsGrid}>
                {q.options.map(opt => (
                  <label key={opt.id} style={{ ...styles.option, ...(answers[q.id] === opt.optionKey ? styles.optionSelected : {}) }}>
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === opt.optionKey} onChange={() => handleOptionChange(q.id, opt.optionKey)} style={{marginRight: "10px"}} />
                    <span style={{flex: 1}}><b>{opt.optionKey}.</b> {opt.text}</span>
                    {opt.image && <img src={`${API_BASE_URL}${opt.image}`} style={styles.optionImage} alt="O" />}
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
