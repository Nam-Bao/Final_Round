# Đánh giá AI phân tích da

Các script trong thư mục này đo chất lượng phân tích da **theo đúng luồng của app** (`services/postprocess.js` + `config/aiConfig.json`), nên số đo được chính là điều khách thấy.

## Dữ liệu

| Tập | Ảnh | Nhãn | Ghi chú |
|---|---|---|---|
| train | 1348 | 9562 | Dùng để huấn luyện model (không dùng để đo) |
| valid | 295 | 1126 | Dùng để **chọn** ngưỡng |
| test | 203 | 1232 | Chỉ dùng để **đo** sau khi đã chốt ngưỡng |

Nguồn: bộ dữ liệu công khai trên Roboflow Universe (định dạng COCO, thư mục `data/`, không đưa lên git). Model: `skin-problems-detection-jp4jv` phiên bản 4.
Ảnh trùng gần như hệt với tập train (tương quan ≥ 0.97, `leakage/leak-*.json` do `check_leakage.js` tạo) bị loại khi đo: 2 ảnh valid, 4 ảnh test.

## Script

| Script | Việc | Gọi API? |
|---|---|---|
| `evaluate.js` | Gọi Roboflow cho từng ảnh có nhãn, lưu kết quả vào `.cache/` | Có (Roboflow) |
| `evaluate-app.js` | Đo theo luồng app từ `.cache/`: mức cả ảnh, mức từng khung, mức độ (thang Hayashi); `--tune` chọn ngưỡng trên valid; `--gemini` so với Gemini | Không |
| `gemini_eval.js` | Hỏi Gemini từng ảnh: có 4 nhóm vấn đề không (mức cả ảnh), lưu `.cache/gemini/<model>/<tập>.jsonl` | Có (Gemini) |
| `image_quality_calibrate.js` | Chọn ngưỡng kiểm tra ảnh tối / mờ / cháy sáng | Không |
| `export_training.js` | Xuất bộ dữ liệu COCO từ các lượt soi bác sĩ đã xác nhận, khách đồng ý và **đủ nhãn** (`services/training.js`); ảnh **làm mờ vùng mắt** (`services/eyeBlur.js`, @vladmandic/face-api), tên ngẫu nhiên, xoá EXIF; chia train / test theo khách; `removed.json` cho khách rút lại đồng ý / xóa lượt soi | Không (tải ảnh từ Cloudinary) |
| `face_calibrate.js` | Đo xác thực ảnh chấm công trên thư mục ảnh theo từng người: tỉ lệ từ chối nhầm / chấp nhận nhầm theo ngưỡng, chọn `FACE_MATCH_THRESHOLD` / `FACE_REVIEW_THRESHOLD` (ảnh sinh trắc học: không đưa lên git, xoá sau khi đo) | Không |
| `ensemble_eval.js` | So sánh / gộp model v1 với v4 từ cache (cần chạy `evaluate.js --model skin-problems-detection-jp4jv/1` trước) | Không |
| `check_leakage.js`, `dataset_stats.js` | Tìm ảnh trùng giữa các tập; thống kê kích thước khung | Không |
| `rag_eval.js` | Chatbot trước / sau RAG: bộ câu hỏi sinh từ dữ liệu đang chạy (giá, gói, sản phẩm, bác sĩ, chính sách) + câu ngoài phạm vi + câu hỏi dữ liệu riêng (đo luồng xin phép). Kết quả: `docs/DANH-GIA-CHATBOT-RAG.md` | Có (Gemini) |
| `safety_rag_eval.js` | AI rà soát đơn kê trước / sau RAG: 10 ca mục kê viết bằng tên khác mà bảng quy tắc bỏ sót + 2 ca an toàn. Chạy sau `rag_eval.js` (ghi thêm vào cùng file) | Có (Gemini) |

```bash
node scripts/evaluate-app.js --split valid --tune
node scripts/evaluate-app.js --split test --gemini .cache/gemini/gemini-3.5-flash-lite/test.jsonl --json scripts/reports/compare-test-flash-lite.json
```

## Kết quả (tập test, 199 ảnh, 11/2026)

**Mức cả ảnh** - app kết luận ảnh "có nhóm vấn đề này" (đây là phần khách đọc):

| Nhóm | Precision | Recall | F1 |
|---|---|---|---|
| Nám / tàn nhang | 98% | 88% | 93% |
| Mụn viêm | 87% | 86% | 87% |
| Thâm sau mụn | 70% | 77% | 73% |
| Mụn đầu đen / đầu trắng | 54% | 67% | 60% |
| **Trung bình** | | | **78%** |

**Mức từng khung** (IoU ≥ 0.3): nám / tàn nhang F1 75%, mụn viêm 35%, mụn đầu đen / trắng 9%, thâm sau mụn 6%.
=> App **không vẽ khung** cho thâm sau mụn và mụn đầu đen / trắng (`drawBoxes: false`), chỉ kết luận có / không.

**Mức độ mụn viêm**: số mụn viêm app vẽ được quy theo thang Hayashi (1 - 5 nhẹ, 6 - 20 trung bình, > 20 nặng), so với thang Hayashi trên nhãn thật: khớp đúng mức 74% (valid 82%), không bao giờ lệch quá 1 mức. Thay cho "điểm /100" cũ (tính từ số khung và diện tích khung, không kiểm chứng được).

**Chỉnh ngưỡng "có vấn đề" trên valid** (`--tune`): ngưỡng mới không tốt hơn trên test (F1 trung bình vẫn 78%) => giữ ngưỡng cũ. Ngưỡng mức độ chỉnh riêng (7 / 15) cũng không tốt hơn thang Hayashi chuẩn (73% so với 74%).

**Báo nhầm "chưa xác định"**: 2 - 3% ảnh có mụn / thâm bị app kết luận "chưa xác định" (ít trấn an sai).

## So sánh với Gemini (mức cả ảnh, cùng 199 ảnh test)

Gemini 3.5 Flash-Lite (model dự phòng của app; Gemini 3.6 Flash gói miễn phí chỉ 20 lượt / ngày nên không đo đủ):

| Nhóm | Roboflow F1 | Gemini F1 | Gemini precision | Gemini recall |
|---|---|---|---|---|
| Mụn viêm | 87% | 86% | 76% | 99% |
| Mụn đầu đen / đầu trắng | 60% | 50% | 38% | 74% |
| Thâm sau mụn | 73% | 65% | 49% | 97% |
| Nám / tàn nhang | 93% | 71% | 57% | 94% |
| **Trung bình** | **78%** | **68%** | | |

Kết hợp hai nguồn: "một trong hai báo có" 70%, "cả hai cùng báo có" 76% => **không tốt hơn Roboflow một mình**.
Gemini bắt gần hết ca có vấn đề nhưng **báo thừa rất nhiều**. Mức độ mụn viêm từ số nốt Gemini ước lượng chỉ khớp thang Hayashi 51%.
Gemini mất ~2 giây, ~1300 token vào và ~150 token ra mỗi ảnh.

**Kết luận**: giữ Roboflow để phát hiện; Gemini chỉ viết nhận xét / lời khuyên và được dặn bám theo nhóm vấn đề Roboflow đã phát hiện (`services/skinVision.js`).

## Thử gộp model v1 với v4 (`ensemble_eval.js`, 11/2026)

Trang Roboflow ghi v1 có mAP@50 57.5% (v4: 51.4%), nhưng **v1 chỉ nhận biết 3 loại** (blackhead, whitehead, papules), không có mụn mủ / bọc, thâm, nám, tàn nhang. Hai con số mAP đo trên các tập và số loại khác nhau nên không so trực tiếp được.
Đo trên cùng ảnh (mức cả ảnh, F1):

| Cách | Mụn viêm valid / test | Mụn đầu đen/trắng valid / test |
|---|---|---|
| v4 một mình (đang dùng) | 78% / 87% | 55% / 60% |
| v1 một mình | 40% / 47% | 28% / 32% |
| Gộp hết khung hai model | 77% / 85% | 40% / 47% |
| v4 **hoặc** v1 (ngưỡng v1 chọn trên valid) | 79% / 87% | 56% / 60% |
| v4 **và** v1 | 53% / 67% | 38% / 41% |

=> Gộp không cải thiện đáng kể (tốt nhất +0.1 điểm) mà tốn gấp đôi lượt gọi Roboflow và thời gian chờ => **giữ v4**.

## Kiểm tra chất lượng ảnh

Đo 300 ảnh bộ dữ liệu và bản làm hỏng có kiểm soát (`image_quality_calibrate.js`), ngưỡng trong `aiConfig.json > imageQuality`:

| Kiểm tra | Ngưỡng | Loại nhầm ảnh tốt | Bắt ảnh hỏng |
|---|---|---|---|
| Mờ (độ lệch chuẩn Laplacian) | < 2.5 | 1% | 80% ảnh làm mờ |
| Tối (độ sáng trung bình) | < 45 | 1% | 97% ảnh làm tối |
| Cháy sáng | > 225 | 0% | 33% ảnh làm chói |

Ảnh không đạt: server trả 422, **không trừ lượt**, khách chọn chụp lại hoặc vẫn phân tích.

## Giới hạn của số đo

- Ảnh đo cùng nguồn với ảnh huấn luyện, phần lớn chụp cận; **ảnh selfie thật** của khách (ánh sáng phòng, camera điện thoại, chụp xa) thường cho kết quả **kém hơn**.
- Người gán nhãn hay bỏ sót nốt nhỏ nên điểm mức từng khung có thể bị đánh giá thấp hơn thực tế.
- Nếp nhăn, lỗ chân lông to, quầng thâm, tăng sắc tố: model gần như không nhận ra (F1 = 0), app đã tắt.
