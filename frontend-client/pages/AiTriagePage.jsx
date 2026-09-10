import React, { useState } from 'react';
import { UploadCloud, CheckCircle, Sparkles, BookOpen } from 'lucide-react';

export default function AiTriagePage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('IDLE');
  const [result, setResult] = useState(null);
  const [diaryNote, setDiaryNote] = useState('');

  const handleImageChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  const handleAnalyze = () => {
    if (!file) return;
    setStatus('ANALYZING');
    setTimeout(() => {
      setStatus('ANALYSIS_COMPLETED');
      setResult({
        acneScore: 68, pigmentationScore: 42, skinType: 'Da hỗn hợp thiên dầu',
        recommendations: ['Có dấu hiệu mụn viêm vùng chữ T', 'Khuyên dùng: Khám chuyên sâu & Liệu trình Làm sạch sâu']
      });
    }, 2500);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-base-content">Sàng Lọc Da Thông Minh Bằng AI</h1>
        <p className="text-base-content/60 mt-2">Chụp hoặc tải ảnh cận cảnh gương mặt để nhận diện chỉ số da.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card bg-base-100 shadow-xl border border-base-200 p-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><UploadCloud className="text-primary"/> Tải ảnh lên</h2>
          <div className="border-2 border-dashed border-base-300 rounded-2xl p-6 text-center bg-base-200/50 flex flex-col items-center justify-center min-h-[260px]">
            {preview ? <img src={preview} className="max-h-60 rounded-lg object-cover shadow" alt="Preview"/> : 
              <span className="text-sm text-base-content/60">Kéo thả ảnh định dạng JPG, PNG (Ảnh chính diện, đủ sáng)</span>}
            <input type="file" accept="image/*" onChange={handleImageChange} className="mt-4 file-input file-input-bordered file-input-primary file-input-sm w-full max-w-xs" />
          </div>
          <button onClick={handleAnalyze} disabled={!file || status === 'ANALYZING'} className="btn btn-primary w-full mt-4">
            {status === 'ANALYZING' ? <><span className="loading loading-spinner"></span> ANALYZING...</> : 'Bắt đầu phân tích AI'}
          </button>
        </div>

        <div className="card bg-base-100 shadow-xl border border-base-200 p-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Sparkles className="text-secondary"/> Kết quả AI</h2>
          {status === 'IDLE' && <div className="h-64 flex items-center justify-center text-base-content/40">Chưa có dữ liệu.</div>}
          {status === 'ANALYZING' && <div className="h-64 flex flex-col items-center justify-center"><div className="radial-progress text-primary animate-spin" style={{"--value":70}}></div><p className="mt-4">Đang quét ma trận da...</p></div>}
          {status === 'ANALYSIS_COMPLETED' && result && (
            <div className="space-y-4">
              <span className="badge badge-success text-white py-3 px-4"><CheckCircle className="w-4 h-4 mr-1"/> ANALYSIS_COMPLETED</span>
              <p className="font-bold text-lg">{result.skinType}</p>
              <div>
                <p className="flex justify-between text-xs mb-1"><span>Chỉ số Mụn</span><span className="text-error">{result.acneScore}%</span></p>
                <progress className="progress progress-error w-full" value={result.acneScore} max="100"></progress>
              </div>
              <div>
                <p className="flex justify-between text-xs mb-1"><span>Chỉ số Sắc tố</span><span className="text-warning">{result.pigmentationScore}%</span></p>
                <progress className="progress progress-warning w-full" value={result.pigmentationScore} max="100"></progress>
              </div>
              <div className="bg-base-200 p-4 rounded-xl">
                <h3 className="text-sm font-bold mb-2">Đánh giá sơ bộ:</h3>
                <ul className="list-disc list-inside text-sm space-y-1">{result.recommendations.map((r,i) => <li key={i}>{r}</li>)}</ul>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="card bg-base-100 shadow border border-base-200 p-6">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><BookOpen className="text-accent"/> Nhật ký da (Skin Diary)</h2>
        <div className="flex gap-4">
          <textarea className="textarea textarea-bordered flex-1" placeholder="Ghi nhận hiện tượng da hôm nay..." value={diaryNote} onChange={(e) => setDiaryNote(e.target.value)}></textarea>
          <button className="btn btn-neutral self-end" onClick={() => { alert('Đã lưu!'); setDiaryNote(''); }}>Lưu</button>
        </div>
      </div>
    </div>
  );
}