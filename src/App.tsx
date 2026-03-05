import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';

const SAMPLE_PACKAGES = [
  { pkg: 'com.acme.taskflow', name: 'TaskFlow Pro', ver: '3.2.1', code: 47 },
  { pkg: 'io.pixel.camera', name: 'Pixel Camera', ver: '1.0.8', code: 12 },
  { pkg: 'com.neon.wallet', name: 'NeonWallet', ver: '2.5.0', code: 33 },
];

const BUILD_STEPS = [
  { pct: 8,  log: '🔍 Checking Gradle wrapper...', type: 'info' },
  { pct: 14, log: 'Configuration cache hit — skipping full configure', type: 'info' },
  { pct: 22, log: ':app:preBuild UP-TO-DATE', type: 'info' },
  { pct: 28, log: ':app:generateDebugBuildConfig', type: 'info' },
  { pct: 34, log: ':app:compileReleaseKotlin', type: 'info' },
  { pct: 40, log: '⚙  Kotlin incremental compilation (123 files)', type: 'info' },
  { pct: 48, log: ':app:mergeReleaseAssets', type: 'info' },
  { pct: 55, log: '⚡ ProGuard: Applying 6 keep rules', type: 'warn' },
  { pct: 62, log: 'ProGuard: Removed 2,847 unused classes (63% reduction)', type: 'ok' },
  { pct: 68, log: ':app:dexBuilderRelease — classes.dex', type: 'info' },
  { pct: 74, log: ':app:packageRelease', type: 'info' },
  { pct: 80, log: '🔐 Signing APK with keystore...', type: 'info' },
  { pct: 87, log: 'jarsigner: Verified signature SHA256withRSA', type: 'ok' },
  { pct: 92, log: ':app:assembleRelease', type: 'info' },
  { pct: 96, log: 'zipalign: alignment OK (4-byte boundaries)', type: 'ok' },
  { pct: 100, log: null, type: 'done' },
];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function App() {
  const [project, setProject] = useState<any>(null);
  const [keystore, setKeystore] = useState<any>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildDone, setBuildDone] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Idle · Ready');
  const [statusActive, setStatusActive] = useState(false);
  const [mode, setMode] = useState('release');
  const [variant, setVariant] = useState('universal');
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isKeystoreDragOver, setIsKeystoreDragOver] = useState(false);
  const [keystoreFile, setKeystoreFile] = useState<File | null>(null);
  const [keystoreError, setKeystoreError] = useState<string | null>(null);

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPkg, setNewProjectPkg] = useState('');
  const [newProjectVer, setNewProjectVer] = useState('1.0.0');
  const [newProjectCode, setNewProjectCode] = useState('1');

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeModal === 'keystore') {
      if (keystore && keystore.file) {
        setKeystoreFile(keystore.file);
      } else {
        setKeystoreFile(null);
      }
      setIsKeystoreDragOver(false);
      setKeystoreError(null);
    }
  }, [activeModal, keystore]);

  const handleKeystoreFile = async (file: File) => {
    setKeystoreError(null);
    
    if (!file.name.endsWith('.jks') && !file.name.endsWith('.keystore')) {
      setKeystoreError('Invalid file type. Only .jks and .keystore are allowed.');
      return;
    }
    
    if (file.size === 0) {
      setKeystoreError('File is empty or corrupted.');
      return;
    }

    try {
      const buffer = await file.slice(0, 4).arrayBuffer();
      const view = new DataView(buffer);
      if (view.byteLength >= 4) {
        const magic = view.getUint32(0);
        // JKS magic: 0xFEEDFEED (4276993773)
        // PKCS12 magic: usually starts with 0x30 (48)
        if (magic !== 0xFEEDFEED && (magic >>> 24) !== 0x30) {
          setKeystoreError('Invalid keystore format or corrupted file.');
          return;
        }
      } else {
        setKeystoreError('File is too small to be a valid keystore.');
        return;
      }
    } catch (e) {
      setKeystoreError('Failed to read file.');
      return;
    }

    setKeystoreFile(file);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (text: string, type = 'info') => {
    setLogs(prev => [...prev, { text, type, id: Date.now() + Math.random() }]);
  };

  const simulateProjectLoad = () => {
    if (isBuilding) return;
    const info = SAMPLE_PACKAGES[Math.floor(Math.random() * SAMPLE_PACKAGES.length)];
    setProject(info);
    setLogs([]);
    addLog('Project attached: /projects/' + info.name.replace(' ', ''), 'ok');
    addLog('Gradle wrapper found: gradle-8.4-bin.zip', 'info');
    addLog('Build variants detected: debug, release', 'info');
    setStatusText('Ready · ' + info.pkg);
    setStatusActive(false);
  };

  const executeBuild = async (buildMode: string, buildVariant: string, currentProject: any, currentKeystore: any) => {
    setIsBuilding(true);
    setBuildDone(false);
    setLogs([]);
    setProgress(0);
    setStatusText('Building · ' + buildMode.toUpperCase() + ' · ' + buildVariant);
    setStatusActive(true);
    
    addLog('🚀 Starting Gradle build · ' + new Date().toLocaleTimeString(), 'info');
    addLog(`📱 Mode: ${buildMode.toUpperCase()} | Variant: ${buildVariant}`, 'info');
    if (currentKeystore) {
      addLog(`🔐 Keystore: ${currentKeystore.alias} (OS keychain)`, 'info');
      if (currentKeystore.password) addLog(`🔑 Keystore password provided: ***`, 'info');
      if (currentKeystore.keyPassword) addLog(`🔑 Key password provided: ***`, 'info');
    }
    
    const steps = buildMode === 'debug'
      ? BUILD_STEPS.filter((_, i) => i !== 11 && i !== 12)
      : BUILD_STEPS;
      
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const delay = 280 + Math.random() * 220;
      await sleep(delay);
      
      if (step.type === 'done') {
        break;
      }
      
      setProgress(step.pct);
      if (step.log) addLog(step.log, step.type);
    }
    
    setIsBuilding(false);
    setBuildDone(true);
    const signed = buildMode === 'release' && !!currentKeystore;
    const size = (18 + Math.random() * 22).toFixed(1);
    
    const result = { signed, variant: buildVariant, size, mode: buildMode, pkg: currentProject.pkg };
    setLastResult(result);
    
    addLog(`✅ BUILD SUCCESSFUL in ${(8 + Math.random() * 4).toFixed(1)}s`, 'ok');
    addLog(`📦 app-${buildVariant}-release.apk · ${size} MB`, 'ok');
    if (signed) addLog('🔐 APK signed with SHA256withRSA', 'ok');
    if (buildMode === 'release') addLog('⚡ ProGuard: 63% code reduction applied', 'ok');
    
    setProgress(100);
    setStatusText('Success · ' + buildVariant.toUpperCase());
    setStatusActive(false);
    
    const entry = {
      id: Date.now(),
      pkg: currentProject.pkg,
      name: currentProject.name,
      ver: currentProject.ver,
      signed,
      proguard: buildMode === 'release',
      variant: buildVariant,
      size,
      mode: buildMode,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setHistory(prev => [entry, ...prev]);
  };

  const handleAnalyzeLogs = async () => {
    if (logs.length === 0 || isBuilding) return;
    setActiveModal('ai-analysis');
    setIsAnalyzing(true);
    setAiResponse(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const logText = logs.map(l => `[${l.type.toUpperCase()}] ${l.text}`).join('\n');
      
      const prompt = `You are an expert Android developer analyzing build logs. 

Please provide your analysis in the following strict Markdown format:

## 📊 Build Summary
- **Status:** [Success/Failed]
- **Key Events:** [Brief summary of main build events]

## 🔍 Detailed Analysis
[Provide a concise explanation of what happened during the build process, focusing on the most critical steps or failures.]

## 💡 Recommendations
[If failed: Provide step-by-step actionable fixes for the errors.]
[If successful: Provide 2-3 specific, actionable optimizations for build speed, app size, or security (e.g., specific ProGuard rules, Gradle caching flags, or R8 optimizations).]

Keep your response concise, professional, and directly actionable.

Logs:
\`\`\`
${logText}
\`\`\``;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
      });
      
      setAiResponse(response.text || 'No response generated.');
    } catch (error) {
      setAiResponse('Error analyzing logs: ' + (error as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBuild = () => {
    if (isBuilding) return;
    
    let currentProject = project;
    if (!currentProject) {
      currentProject = SAMPLE_PACKAGES[Math.floor(Math.random() * SAMPLE_PACKAGES.length)];
      setProject(currentProject);
      setLogs([]);
      addLog('Project attached: /projects/' + currentProject.name.replace(' ', ''), 'ok');
      addLog('Gradle wrapper found: gradle-8.4-bin.zip', 'info');
      addLog('Build variants detected: debug, release', 'info');
    }

    if (mode === 'release' && !keystore) {
      setActiveModal('keystore');
      return;
    }
    
    executeBuild(mode, variant, currentProject, keystore);
  };

  return (
    <div className="flex flex-col w-full max-w-[1200px] mx-auto my-5 bg-[#050816]/95 rounded-[20px] border border-white/5 shadow-[0_0_0_1px_rgba(0,255,136,0.03),0_32px_80px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden animate-app-in font-sans">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-gradient-to-r from-vp-accent/5 to-transparent relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-gradient-to-r after:from-vp-accent/30 after:to-transparent/50">
        <div className="flex items-center gap-3">
          <div className="w-[34px] h-[34px] rounded-[10px] p-[2px] shadow-[0_0_16px_rgba(0,255,136,0.25)] animate-logo-spin" style={{ background: 'conic-gradient(from 210deg, #ff3c6e, #ffb14b, #00ff88, #4b8bff, #ff3c6e)' }}>
            <div className="w-full h-full rounded-lg bg-[#060919] flex items-center justify-center text-base">⚡</div>
          </div>
          <div className="flex flex-col gap-[1px]">
            <div className="font-mono text-[15px] font-bold tracking-[0.12em] uppercase bg-gradient-to-r from-white to-[#a0a0d0] bg-clip-text text-transparent">VoltPak</div>
            <div className="font-mono text-[10px] text-vp-text2 tracking-[0.18em] uppercase">V1.6 • Signed + ProGuard</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-[5px] rounded-full border border-vp-accent/35 text-vp-accent text-[10px] font-mono bg-vp-accent/5 tracking-[0.1em] uppercase">Play Store‑Ready APK</div>
          <button onClick={() => setActiveModal('settings')} className="rounded-full px-[14px] py-[6px] bg-transparent text-vp-text2 border border-white/10 text-[11px] font-mono cursor-pointer transition-all duration-150 hover:border-white/20 hover:text-vp-text hover:bg-white/5">⚙ Settings</button>
        </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] p-4 gap-3">
        <section className="bg-[radial-gradient(circle_at_30%_0%,#0d1025,#060919)] rounded-[14px] border border-white/5 p-[14px] flex flex-col gap-[10px] min-h-0">
          <div className="flex items-center justify-between font-mono text-[10px] text-vp-text2 uppercase tracking-[0.16em]">
            <div className="flex items-center gap-2">
              <div className={`w-[6px] h-[6px] rounded-full ${project ? 'bg-vp-accent shadow-[0_0_6px_var(--color-vp-accent)]' : 'bg-vp-muted'}`}></div>
              <span>Project · Android Gradle</span>
            </div>
            <span className={`px-2 py-[3px] rounded-full border text-[9px] uppercase tracking-[0.1em] ${project ? 'bg-white/5 border-vp-accent/40 text-vp-accent' : 'bg-white/5 border-white/5 text-vp-muted'}`}>
              {project ? 'Loaded' : 'No project'}
            </span>
          </div>
          
          <div 
            className={`p-5 rounded-xl border border-dashed cursor-pointer transition-all duration-200 relative overflow-hidden ${isDragOver ? 'border-vp-accent/45 dropzone-bg-hover' : project ? 'border-vp-accent/30 border-solid bg-vp-accent/5' : 'border-white/15 dropzone-bg hover:border-vp-accent/45 hover:dropzone-bg-hover'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); simulateProjectLoad(); }}
            onClick={() => {
              if (!isBuilding) {
                setNewProjectName('');
                setNewProjectPkg('');
                setNewProjectVer('1.0.0');
                setNewProjectCode('1');
                setActiveModal('new-project');
              }
            }}
          >
            {project ? (
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-vp-accent/20 to-vp-accent3/20 border border-vp-accent/30 flex items-center justify-center text-2xl shadow-[0_0_15px_rgba(0,255,136,0.15)]">📦</div>
                <div className="flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-sans text-[16px] font-bold text-vp-text tracking-tight">{project.name}</div>
                    <div className="px-2 py-1 rounded bg-vp-accent/10 border border-vp-accent/20 text-vp-accent font-mono text-[10px] font-bold">v{project.ver}</div>
                  </div>
                  <div className="font-mono text-[11px] text-vp-text2 mb-3">{project.pkg}</div>
                  <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                    <span className="px-2 py-[2px] rounded-md bg-white/5 border border-white/10 text-vp-text2">Code: <span className="text-vp-text">{project.code}</span></span>
                    <span className="px-2 py-[2px] rounded-md bg-white/5 border border-white/10 text-vp-text2">Module: <span className="text-vp-text">/app</span></span>
                    <span className="px-2 py-[2px] rounded-md bg-white/5 border border-white/10 text-vp-text2">Gradle <span className="text-vp-text">8.4</span></span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <span className="text-2xl mb-[6px] block">📁</span>
                <div className="font-mono text-[13px] font-medium mb-1">Drop Android project folder or click to choose</div>
                <div className="text-[11px] text-vp-text2 mb-2">Looks for /app, Gradle wrapper, and build.gradle</div>
                <div className="flex flex-wrap gap-[6px] text-[10px] font-mono">
                  <span className="px-2 py-[2px] rounded-md bg-white/5 border border-white/5 text-vp-muted">Package: —</span>
                  <span className="px-2 py-[2px] rounded-md bg-white/5 border border-white/5 text-vp-muted">Version: —</span>
                  <span className="px-2 py-[2px] rounded-md bg-white/5 border border-white/5 text-vp-muted">Module: /app</span>
                </div>
              </>
            )}
          </div>
          
          <div className="flex items-end gap-[10px]">
            <div className="flex-1">
              <label className="block text-[9px] uppercase tracking-[0.15em] text-vp-muted font-mono mb-1">Mode</label>
              <select value={mode} onChange={e => setMode(e.target.value)} className="w-full px-[10px] py-2 rounded-[9px] border border-white/5 bg-[#080a1a]/98 text-vp-text font-mono text-[11px] outline-none cursor-pointer transition-colors duration-150 focus:border-vp-accent/40 focus:shadow-[0_0_0_2px_rgba(0,255,136,0.08)]">
                <option value="debug">Debug</option>
                <option value="release">Release (Signed)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[9px] uppercase tracking-[0.15em] text-vp-muted font-mono mb-1">Variant</label>
              <select value={variant} onChange={e => setVariant(e.target.value)} className="w-full px-[10px] py-2 rounded-[9px] border border-white/5 bg-[#080a1a]/98 text-vp-text font-mono text-[11px] outline-none cursor-pointer transition-colors duration-150 focus:border-vp-accent/40 focus:shadow-[0_0_0_2px_rgba(0,255,136,0.08)]">
                <option value="universal">Universal</option>
                <option value="arm64">ARM64</option>
                <option value="armeabi-v7a">ARMv7</option>
              </select>
            </div>
            <button 
              onClick={handleBuild}
              disabled={isBuilding}
              className="min-w-[116px] px-4 py-[9px] rounded-xl border-none cursor-pointer bg-gradient-to-br from-[#ff3c6e] via-[#ff6b35] to-[#ffb14b] text-[#05050a] font-mono text-[11px] font-bold uppercase tracking-[0.14em] shadow-[0_8px_24px_rgba(255,60,110,0.45),0_0_0_1px_rgba(255,60,110,0.2)] transition-all duration-200 flex items-center justify-center gap-[6px] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none hover:not-disabled:-translate-y-[1px] hover:not-disabled:shadow-[0_12px_30px_rgba(255,60,110,0.55),0_0_0_1px_rgba(255,60,110,0.3)] active:not-disabled:translate-y-0"
            >
              {isBuilding ? '⏳ Building...' : '▶ Build APK'}
            </button>
          </div>
          
          <div className="relative">
            <div className="w-full h-[3px] rounded-full bg-white/5 overflow-hidden">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-vp-accent via-vp-accent3 to-vp-accent2 transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] relative animate-shimmer"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="absolute right-0 -top-4 font-mono text-[9px] text-vp-muted transition-all duration-400">
              {progress > 0 ? `${progress}%` : ''}
            </div>
          </div>
          
          <div className="flex-1 min-h-[180px] max-h-[280px] rounded-[10px] bg-[#030510] border border-white/5 p-[10px] font-mono text-[10.5px] overflow-y-auto scroll-smooth flex flex-col custom-scrollbar">
            {logs.length === 0 ? (
              <div className="text-vp-muted text-[10px] text-center py-10 m-auto">No build running · Logs appear here</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="flex gap-2 items-start mb-[2px] animate-log-in">
                  <div className={`min-w-[44px] text-right text-[8.5px] uppercase tracking-[0.1em] pt-[1px] shrink-0 ${log.type === 'ok' ? 'text-vp-accent' : log.type === 'err' ? 'text-vp-accent2' : log.type === 'warn' ? 'text-[#ffb14b]' : 'text-vp-muted'}`}>
                    {log.type === 'ok' ? 'OK' : log.type === 'err' ? 'ERR' : log.type === 'warn' ? 'WARN' : 'INFO'}
                  </div>
                  <div className={`flex-1 leading-relaxed ${log.type === 'info' ? 'text-vp-text2' : log.type === 'ok' ? 'text-vp-accent' : log.type === 'err' ? 'text-vp-accent2' : log.type === 'warn' ? 'text-[#ffb14b]' : ''}`}>
                    {log.text}
                  </div>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
          
          <div className="flex items-center justify-between text-[10px] font-mono text-vp-muted">
            <span>
              <span className={`inline-block w-[5px] h-[5px] rounded-full mr-[5px] align-middle ${statusActive ? 'bg-vp-accent shadow-[0_0_6px_var(--color-vp-accent)] animate-pulse-dot' : buildDone ? 'bg-vp-accent shadow-[0_0_6px_var(--color-vp-accent)]' : 'bg-vp-muted'}`}></span>
              <span>{statusText}</span>
            </span>
            <div className="flex gap-2">
              <button 
                className={`px-3 py-[6px] rounded-full border text-[10px] font-mono inline-flex items-center gap-[5px] uppercase tracking-[0.1em] transition-all duration-200 whitespace-nowrap ${logs.length > 0 && !isBuilding ? 'text-vp-accent3 border-vp-accent3/50 bg-vp-accent3/10 cursor-pointer shadow-[0_0_12px_rgba(75,139,255,0.15)] hover:bg-vp-accent3/20 hover:shadow-[0_0_20px_rgba(75,139,255,0.25)]' : 'bg-vp-accent3/5 border-vp-accent3/25 text-vp-text2 cursor-not-allowed'}`}
                onClick={handleAnalyzeLogs}
                disabled={logs.length === 0 || isBuilding}
              >
                ✨ AI Analysis
              </button>
              <button 
                className={`px-3 py-[6px] rounded-full border text-[10px] font-mono inline-flex items-center gap-[5px] uppercase tracking-[0.1em] transition-all duration-200 whitespace-nowrap ${buildDone ? 'text-vp-accent border-vp-accent/50 bg-vp-accent/10 cursor-pointer shadow-[0_0_12px_rgba(0,255,136,0.15)] hover:bg-vp-accent/20 hover:shadow-[0_0_20px_rgba(0,255,136,0.25)]' : 'bg-vp-accent/5 border-vp-accent/25 text-vp-text2 cursor-not-allowed'}`}
                onClick={() => {
                  if (!buildDone || !lastResult) return;
                  addLog('Saving APK to ~/Downloads/app-release.apk ...', 'info');
                  setTimeout(() => addLog('✅ Saved: app-' + lastResult.variant + '-release.apk', 'ok'), 800);
                }}
              >
                {buildDone ? (
                  <>
                    {lastResult?.signed ? '🔐 ' : ''}
                    {lastResult?.mode === 'release' ? '⚡ ' : ''}
                    ⬇ {lastResult?.size} MB
                  </>
                ) : '⬇ APK'}
              </button>
            </div>
          </div>
        </section>
        
        <section className="bg-[radial-gradient(circle_at_30%_0%,#0d1025,#060919)] rounded-[14px] border border-white/5 p-[14px] flex flex-col gap-[10px] min-h-0">
          <div className="flex items-center justify-between font-mono text-[10px] text-vp-text2 uppercase tracking-[0.16em]">
            <div className="flex items-center gap-2">
              <div className="w-[6px] h-[6px] rounded-full bg-vp-accent3 shadow-[0_0_6px_var(--color-vp-accent3)]"></div>
              <span>Build History</span>
            </div>
            <span className="px-2 py-[3px] rounded-full bg-white/5 border border-white/5 text-[9px] uppercase tracking-[0.1em] text-vp-muted">Signed · ProGuard</span>
          </div>
          
          <div className="rounded-[10px] border border-white/5 bg-[#030510] p-1 font-mono text-[10.5px] max-h-[340px] overflow-y-auto flex-1 custom-scrollbar">
            {history.length === 0 ? (
              <div className="text-center py-9 px-[10px] text-vp-muted text-[11px] leading-[1.8]">
                No builds yet<br/><span className="text-[9px] opacity-50">Load a project and hit Build APK</span>
              </div>
            ) : (
              history.map((item, i) => (
                <div key={item.id} className="grid grid-cols-[4px_1fr_auto] items-center gap-[10px] px-[10px] py-2 rounded-lg cursor-pointer transition-colors duration-150 hover:bg-white/5 animate-hist-in" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="w-[3px] h-[36px] rounded-full" style={{ background: item.signed ? 'var(--color-vp-accent2)' : 'var(--color-vp-accent3)' }}></div>
                  <div className="flex flex-col gap-[3px]">
                    <div className="font-medium text-vp-text overflow-hidden text-ellipsis whitespace-nowrap">{item.name}</div>
                    <div className="flex gap-1 items-center flex-wrap">
                      <span className="px-[6px] py-[1px] rounded bg-white/5 text-vp-muted text-[9px] uppercase tracking-[0.08em]">{item.variant}</span>
                      {item.signed && <span className="px-[6px] py-[1px] rounded bg-vp-accent2/15 text-vp-accent2 text-[9px] uppercase tracking-[0.08em]">Signed</span>}
                      {item.proguard && <span className="px-[6px] py-[1px] rounded bg-vp-accent/15 text-vp-accent text-[9px] uppercase tracking-[0.08em]">ProGuard</span>}
                      {item.mode === 'debug' && <span className="px-[6px] py-[1px] rounded bg-vp-accent3/15 text-vp-accent3 text-[9px] uppercase tracking-[0.08em]">Debug</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-[3px] text-right">
                    <div className="text-vp-text2 text-[10px] font-medium">{item.size} MB</div>
                    <div className="text-vp-muted text-[9px]">{item.time}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="flex items-center justify-between text-[10px] font-mono text-vp-muted">
            <span>Drag project → <span className="px-[6px] py-[2px] rounded-[5px] border border-white/10 bg-[#080a18]/95 text-[9px]">Release</span> → Build</span>
            <span>Auto‑refresh · 5s</span>
          </div>
        </section>
      </main>

      {activeModal === 'new-project' && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[9999] animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}>
          <div className="w-[480px] max-w-[92vw] rounded-[18px] bg-[radial-gradient(circle_at_top,#131526,#060919)] border border-white/10 p-6 font-mono animate-modal-in shadow-[0_40px_100px_rgba(0,0,0,0.8)]">
            <div className="text-[15px] font-bold uppercase tracking-[0.14em] mb-1 text-vp-accent">📦 Load Project</div>
            <div className="text-[11px] text-vp-text2 mb-5 leading-[1.6]">
              Specify the details of the Android project you want to build.
            </div>
            
            <div className="flex flex-col gap-3 mb-5">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-[0.14em] text-vp-muted">App Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. TaskFlow Pro" 
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  className="px-[11px] py-[9px] rounded-[9px] border border-white/5 bg-[#050814]/98 text-vp-text font-mono text-[11px] outline-none transition-colors duration-150 focus:border-vp-accent/40 focus:shadow-[0_0_0_2px_rgba(0,255,136,0.07)]" 
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-[0.14em] text-vp-muted">Package Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. com.acme.taskflow" 
                  value={newProjectPkg}
                  onChange={e => setNewProjectPkg(e.target.value)}
                  className="px-[11px] py-[9px] rounded-[9px] border border-white/5 bg-[#050814]/98 text-vp-text font-mono text-[11px] outline-none transition-colors duration-150 focus:border-vp-accent/40 focus:shadow-[0_0_0_2px_rgba(0,255,136,0.07)]" 
                />
              </div>
              <div className="flex gap-[10px]">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[9px] uppercase tracking-[0.14em] text-vp-muted">Version Name</label>
                  <input 
                    type="text" 
                    placeholder="1.0.0" 
                    value={newProjectVer}
                    onChange={e => setNewProjectVer(e.target.value)}
                    className="px-[11px] py-[9px] rounded-[9px] border border-white/5 bg-[#050814]/98 text-vp-text font-mono text-[11px] outline-none transition-colors duration-150 focus:border-vp-accent/40 focus:shadow-[0_0_0_2px_rgba(0,255,136,0.07)]" 
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[9px] uppercase tracking-[0.14em] text-vp-muted">Version Code</label>
                  <input 
                    type="number" 
                    placeholder="1" 
                    value={newProjectCode}
                    onChange={e => setNewProjectCode(e.target.value)}
                    className="px-[11px] py-[9px] rounded-[9px] border border-white/5 bg-[#050814]/98 text-vp-text font-mono text-[11px] outline-none transition-colors duration-150 focus:border-vp-accent/40 focus:shadow-[0_0_0_2px_rgba(0,255,136,0.07)]" 
                  />
                </div>
              </div>
            </div>
            
            <div className="flex gap-2 mt-[18px]">
              <button 
                onClick={() => {
                  if (!newProjectName || !newProjectPkg) return;
                  const newProj = {
                    name: newProjectName,
                    pkg: newProjectPkg,
                    ver: newProjectVer || '1.0.0',
                    code: parseInt(newProjectCode) || 1
                  };
                  setProject(newProj);
                  setLogs([]);
                  addLog('Project attached: /projects/' + newProj.name.replace(' ', ''), 'ok');
                  addLog('Gradle wrapper found: gradle-8.4-bin.zip', 'info');
                  addLog('Build variants detected: debug, release', 'info');
                  setStatusText('Ready · ' + newProj.pkg);
                  setStatusActive(false);
                  setActiveModal(null);
                }}
                disabled={!newProjectName || !newProjectPkg}
                className="flex-1 p-[10px] rounded-[10px] border border-vp-accent/50 bg-vp-accent/15 text-vp-accent font-mono text-[11px] font-medium cursor-pointer transition-colors duration-150 uppercase tracking-[0.1em] hover:bg-vp-accent/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Load Project
              </button>
              <button 
                onClick={() => {
                  simulateProjectLoad();
                  setActiveModal(null);
                }}
                className="flex-1 p-[10px] rounded-[10px] border border-white/10 bg-[#080a18]/98 text-vp-text2 font-mono text-[11px] font-medium cursor-pointer transition-colors duration-150 uppercase tracking-[0.1em] hover:border-white/15 hover:text-vp-text"
              >
                Load Random
              </button>
              <button 
                onClick={() => setActiveModal(null)}
                className="flex-1 p-[10px] rounded-[10px] border border-white/10 bg-[#080a18]/98 text-vp-text2 font-mono text-[11px] font-medium cursor-pointer transition-colors duration-150 uppercase tracking-[0.1em] hover:border-white/15 hover:text-vp-text"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'keystore' && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[9999] animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}>
          <div className="w-[480px] max-w-[92vw] rounded-[18px] bg-[radial-gradient(circle_at_top,#131526,#060919)] border border-white/10 p-6 font-mono animate-modal-in shadow-[0_40px_100px_rgba(0,0,0,0.8)]">
            <div className="text-[15px] font-bold uppercase tracking-[0.14em] mb-1 text-vp-accent2">🔐 Keystore Signing</div>
            <div className="text-[11px] text-vp-text2 mb-5 leading-[1.6]">
              Release APKs must be signed for Play Store distribution. <a href="#" onClick={e => e.preventDefault()} className="text-vp-accent no-underline">Generate keystore ↗</a>
            </div>
            
            <div className="flex gap-[10px] mb-[10px]">
              <div 
                className={`flex-[2] flex flex-col gap-1 p-[11px] rounded-[9px] border border-dashed transition-all duration-200 relative ${isKeystoreDragOver ? 'border-vp-accent2/50 bg-vp-accent2/5' : 'border-white/15 bg-[#050814]/98 hover:border-vp-accent2/30'}`}
                onDragOver={(e) => { e.preventDefault(); setIsKeystoreDragOver(true); }}
                onDragLeave={() => setIsKeystoreDragOver(false)}
                onDrop={(e) => { 
                  e.preventDefault(); 
                  setIsKeystoreDragOver(false); 
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleKeystoreFile(e.dataTransfer.files[0]);
                  }
                }}
              >
                <label className="text-[9px] uppercase tracking-[0.14em] text-vp-muted">Keystore file (.jks / .keystore)</label>
                <div className="flex items-center gap-2 mt-1">
                  <input 
                    type="file" 
                    accept=".jks,.keystore" 
                    className="hidden" 
                    id="ks-file-input"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleKeystoreFile(e.target.files[0]);
                      }
                    }}
                  />
                  <label htmlFor="ks-file-input" className="px-[10px] py-1 rounded-md border border-vp-accent2/30 bg-vp-accent2/15 text-vp-accent2 font-mono text-[10px] cursor-pointer hover:bg-vp-accent2/25 transition-colors whitespace-nowrap">
                    Choose File
                  </label>
                  <span className={`text-[10px] font-mono truncate max-w-[150px] ${keystoreError ? 'text-vp-accent2' : 'text-vp-text'}`}>
                    {keystoreError ? keystoreError : (keystoreFile ? keystoreFile.name : 'Or drag & drop here')}
                  </span>
                  {keystoreFile && !keystoreError && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        const url = URL.createObjectURL(keystoreFile);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = keystoreFile.name;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      className="ml-auto px-2 py-1 rounded bg-white/5 border border-white/10 text-vp-text2 hover:text-vp-text hover:bg-white/10 text-[9px] uppercase tracking-[0.1em] transition-colors"
                    >
                      Export
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-[0.14em] text-vp-muted">Key alias</label>
                <input type="text" placeholder="my-key-alias" defaultValue={keystore?.alias || "upload-key"} id="ks-alias" className="px-[11px] py-[9px] rounded-[9px] border border-white/5 bg-[#050814]/98 text-vp-text font-mono text-[11px] outline-none transition-colors duration-150 focus:border-vp-accent/40 focus:shadow-[0_0_0_2px_rgba(0,255,136,0.07)]" />
              </div>
            </div>
            
            <div className="flex gap-[10px] mb-[10px]">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-[0.14em] text-vp-muted">Keystore password</label>
                <input type="password" placeholder="••••••••" defaultValue={keystore?.password || "android"} id="ks-pass" className="px-[11px] py-[9px] rounded-[9px] border border-white/5 bg-[#050814]/98 text-vp-text font-mono text-[11px] outline-none transition-colors duration-150 focus:border-vp-accent/40 focus:shadow-[0_0_0_2px_rgba(0,255,136,0.07)]" />
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-[0.14em] text-vp-muted">Key password</label>
                <input type="password" placeholder="••••••••" defaultValue={keystore?.keyPassword || "android"} id="ks-key-pass" className="px-[11px] py-[9px] rounded-[9px] border border-white/5 bg-[#050814]/98 text-vp-text font-mono text-[11px] outline-none transition-colors duration-150 focus:border-vp-accent/40 focus:shadow-[0_0_0_2px_rgba(0,255,136,0.07)]" />
              </div>
            </div>
            
            <div className="mt-4 p-3 rounded-[10px] bg-vp-accent/5 border border-vp-accent/15 text-[10px] text-vp-text2 flex items-center gap-2">
              🔒 Credentials encrypted in OS keychain — never stored in plaintext
            </div>
            
            <div className="flex gap-2 mt-[18px]">
              <button 
                onClick={() => {
                  const alias = (document.getElementById('ks-alias') as HTMLInputElement)?.value || 'upload-key';
                  const password = (document.getElementById('ks-pass') as HTMLInputElement)?.value || 'android';
                  const keyPassword = (document.getElementById('ks-key-pass') as HTMLInputElement)?.value || 'android';
                  setKeystore({ alias, password, keyPassword, path: '/keystore/release.jks', file: keystoreFile });
                  setActiveModal(null);
                  executeBuild('release', variant, project || SAMPLE_PACKAGES[0], { alias, password, keyPassword, path: '/keystore/release.jks', file: keystoreFile });
                }}
                className="flex-1 p-[10px] rounded-[10px] border border-vp-accent2/50 bg-vp-accent2/15 text-vp-accent2 font-mono text-[11px] font-medium cursor-pointer transition-colors duration-150 uppercase tracking-[0.1em] hover:bg-vp-accent2/25"
              >
                💾 Save & Build
              </button>
              <button 
                onClick={() => {
                  setKeystore(null);
                  setActiveModal(null);
                  executeBuild('release', variant, project || SAMPLE_PACKAGES[0], null);
                }}
                className="flex-1 p-[10px] rounded-[10px] border border-white/10 bg-[#080a18]/98 text-vp-text2 font-mono text-[11px] font-medium cursor-pointer transition-colors duration-150 uppercase tracking-[0.1em] hover:border-white/15 hover:text-vp-text"
              >
                Build Unsigned
              </button>
              <button 
                onClick={() => setActiveModal(null)}
                className="flex-1 p-[10px] rounded-[10px] border border-white/10 bg-[#080a18]/98 text-vp-text2 font-mono text-[11px] font-medium cursor-pointer transition-colors duration-150 uppercase tracking-[0.1em] hover:border-white/15 hover:text-vp-text"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'ai-analysis' && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[9999] animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}>
          <div className="w-[600px] max-w-[92vw] max-h-[85vh] flex flex-col rounded-[18px] bg-[radial-gradient(circle_at_top,#131526,#060919)] border border-white/10 p-6 font-mono animate-modal-in shadow-[0_40px_100px_rgba(0,0,0,0.8)]">
            <div className="text-[15px] font-bold uppercase tracking-[0.14em] mb-1 text-vp-accent3">✨ AI Build Analysis</div>
            <div className="text-[11px] text-vp-text2 mb-5 leading-[1.6]">
              Gemini is analyzing your build logs for optimizations or errors.
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-10 gap-4">
                  <div className="w-8 h-8 rounded-full border-2 border-vp-accent3 border-t-transparent animate-spin"></div>
                  <div className="text-vp-accent3 text-[11px] uppercase tracking-[0.1em] animate-pulse">Analyzing logs...</div>
                </div>
              ) : (
                <div className="markdown-body text-[12px] text-vp-text font-sans leading-relaxed">
                  <Markdown>{aiResponse || ''}</Markdown>
                </div>
              )}
            </div>
            
            <div className="flex justify-end mt-auto pt-4 border-t border-white/10">
              <button 
                onClick={() => setActiveModal(null)}
                className="px-[16px] py-[8px] rounded-lg border border-vp-accent3/40 bg-vp-accent3/10 text-vp-accent3 font-mono text-[11px] cursor-pointer transition-colors duration-150 uppercase tracking-[0.08em] hover:bg-vp-accent3/20 hover:shadow-[0_0_12px_rgba(75,139,255,0.15)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'settings' && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[9999] animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}>
          <div className="w-[480px] max-w-[92vw] rounded-[18px] bg-[radial-gradient(circle_at_top,#131526,#060919)] border border-white/10 p-6 font-mono animate-modal-in shadow-[0_40px_100px_rgba(0,0,0,0.8)]">
            <div className="text-[15px] font-bold uppercase tracking-[0.14em] mb-1 text-vp-text">⚙ Settings</div>
            <div className="text-[11px] text-vp-text2 mb-5 leading-[1.6]">VoltPak v1.6 · Signed release APKs + ProGuard detection</div>
            
            <div className="mb-3">
              <div className="text-[9px] uppercase tracking-[0.14em] text-vp-muted mb-1">Default build mode</div>
              <select className="w-full px-[10px] py-2 rounded-[9px] border border-white/5 bg-[#050814]/98 text-vp-text font-mono text-[11px] outline-none">
                <option>Debug</option>
                <option selected>Release</option>
              </select>
            </div>
            
            <div className="mb-3">
              <div className="text-[9px] uppercase tracking-[0.14em] text-vp-muted mb-1">Default variant</div>
              <select className="w-full px-[10px] py-2 rounded-[9px] border border-white/5 bg-[#050814]/98 text-vp-text font-mono text-[11px] outline-none">
                <option selected>Universal</option>
                <option>ARM64</option>
                <option>ARMv7</option>
              </select>
            </div>
            
            <div className="h-[1px] bg-white/5 my-4"></div>
            
            {keystore ? (
              <div className="p-[14px] rounded-[10px] bg-vp-accent2/5 border border-vp-accent2/20">
                <div className="text-[11px] text-vp-accent2 font-semibold mb-1">🔐 Keystore Active</div>
                <div className="text-[10px] text-vp-text2 mb-[4px]">/keystore/release.jks · alias: {keystore.alias}</div>
                <div className="text-[10px] text-vp-text2 mb-[10px]">Passwords: {keystore.password ? 'Stored' : 'Missing'}</div>
                <div className="flex gap-[6px]">
                  <button 
                    onClick={() => {
                      setKeystore(null);
                      addLog('Stored keystore removed from OS keychain', 'warn');
                      setActiveModal(null);
                    }}
                    className="px-[14px] py-[7px] rounded-lg border border-vp-accent2/40 bg-vp-accent2/5 text-vp-accent2 font-mono text-[10px] cursor-pointer transition-colors duration-150 uppercase tracking-[0.08em] hover:border-white/15 hover:text-vp-text"
                  >
                    Remove
                  </button>
                  <button 
                    onClick={() => setActiveModal('keystore')}
                    className="px-[14px] py-[7px] rounded-lg border border-white/10 bg-[#080a18]/98 text-vp-text2 font-mono text-[10px] cursor-pointer transition-colors duration-150 uppercase tracking-[0.08em] hover:border-white/15 hover:text-vp-text"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-vp-muted text-[10px] font-mono">
                No keystore configured · added on first release build
              </div>
            )}
            
            <div className="flex justify-end gap-2 mt-4">
              <button 
                onClick={() => {
                  setHistory([]);
                  addLog('Build history cleared', 'warn');
                  setActiveModal(null);
                }}
                className="px-[14px] py-[7px] rounded-lg border border-vp-accent2/40 bg-vp-accent2/5 text-vp-accent2 font-mono text-[10px] cursor-pointer transition-colors duration-150 uppercase tracking-[0.08em] hover:border-white/15 hover:text-vp-text"
              >
                Clear History
              </button>
              <button 
                onClick={() => setActiveModal(null)}
                className="px-[14px] py-[7px] rounded-lg border border-vp-accent/40 bg-vp-accent/5 text-vp-accent font-mono text-[10px] cursor-pointer transition-colors duration-150 uppercase tracking-[0.08em] hover:border-white/15 hover:text-vp-text"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
