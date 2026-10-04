import React, { useState } from 'react';
import { UploadCloud, Camera, CheckCircle, Sparkles, BookOpen } from 'lucide-react';

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
        // AI đưa ra hướng điều trị theo ý cô giáo
        recommendations: ['Tình trạng: Có dấu hiệu mụn viêm vùng chữ T', 'Hướng điều trị AI đề xuất: Khám chuyên sâu & Áp dụng Liệu trình Làm sạch sâu lấy nhân mụn chuẩn y khoa.']
      });
    }, 2500);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-base-content">Sàng Lọc Da Thông Minh Bằng AI</h1>
        <p className="text-base-content/60 mt-2">Chụp ảnh trực tiếp hoặc tải ảnh cận cảnh gương mặt để nhận diện chỉ số da.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card bg-base-100 shadow-xl border border-base-200 p-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Camera className="text-primary"/> Cung cấp hình ảnh</h2>
          
          <div className="flex gap-2 mb-4">
             {/* Thêm nút Mở Camera trực tiếp */}
            <button className="btn btn-outline btn-primary flex-1 gap-2" onClick={() => alert('Yêu cầu cấp quyền mở Camera điện thoại/Laptop...')}>
              <Camera className="w-5 h-5"/> Chụp trực tiếp
            </button>
            <div className="flex-1 relative">
              <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <button className="btn btn-outline flex-1 w-full gap-2"><UploadCloud className="w-5 h-5"/> Tải ảnh lên</button>
            </div>
          </div>

          <div className="border-2 border-dashed border-base-300 rounded-2xl p-2 text-center bg-base-200/50 flex flex-col items-center justify-center min-h-[220px]">
            {preview ? <img src={preview} className="max-h-52 rounded-lg object-cover shadow" alt="Preview"/> : 
              <span className="text-sm text-base-content/60">Hình ảnh sẽ hiển thị tại đây</span>}
          </div>
          <button onClick={handleAnalyze} disabled={!file || status === 'ANALYZING'} className="btn btn-primary w-full mt-4">
            {status === 'ANALYZING' ? <><span className="loading loading-spinner"></span> Đang phân tích...</> : 'Bắt đầu phân tích AI'}
          </button>
        </div>

        <div className="card bg-base-100 shadow-xl border border-base-200 p-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Sparkles className="text-secondary"/> Kết quả & Phác đồ gợi ý</h2>
          {status === 'IDLE' && <div className="h-64 flex items-center justify-center text-base-content/40">Chưa có dữ liệu.</div>}
          {status === 'ANALYZING' && <div className="h-64 flex flex-col items-center justify-center"><div className="radial-progress text-primary animate-spin" style={{"--value":70}}></div><p className="mt-4">Đang quét ma trận da...</p></div>}
          {status === 'ANALYSIS_COMPLETED' && result && (
            <div className="space-y-4">
              <span className="badge badge-success text-white py-3 px-4"><CheckCircle className="w-4 h-4 mr-1"/> HOÀN TẤT PHÂN TÍCH</span>
              <p className="font-bold text-lg">{result.skinType}</p>
              <div>
                <p className="flex justify-between text-xs mb-1"><span>Chỉ số Mụn</span><span className="text-error">{result.acneScore}%</span></p>
                <progress className="progress progress-error w-full" value={result.acneScore} max="100"></progress>
              </div>
              <div className="bg-base-200 p-4 rounded-xl border border-primary/20">
                <h3 className="text-sm font-bold mb-2 text-primary">Đánh giá & Gợi ý từ AI:</h3>
                <ul className="list-disc list-inside text-sm space-y-1">{result.recommendations.map((r,i) => <li key={i}>{r}</li>)}</ul>
                <p className="text-xs italic opacity-60 mt-3">*Lưu ý: Kết quả AI chỉ mang tính tham khảo, Bác sĩ sẽ là người ra quyết định cuối cùng.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}