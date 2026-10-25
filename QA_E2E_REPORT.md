# Báo cáo kiểm thử E2E – Đánh giá sản phẩm và khảo sát

Ngày kiểm thử: 26/10/2026 (Cập nhật hoàn tất P2 & P3)  
Môi trường: Windows, Node.js/Express, Microsoft SQL Server `CosmeticsCRM_E2E_DB`, Microsoft Edge qua Playwright  
Phạm vi dữ liệu: database test riêng; không ghi vào `CosmeticsCRM_DB`.

## A. Tổng quan hệ thống

- Frontend: HTML/CSS/JavaScript thuần, Chart.js; router phía client theo vai trò Admin/Manager/Customer.
- Backend: Express REST API, JWT 24 giờ, phân quyền middleware.
- Database: SQL Server Local Express qua `msnodesqlv8` trực tiếp (Windows Integrated Authentication); các bảng chính gồm Accounts, Customers, Products, Feedbacks, FeedbackAuditLog, Surveys, SurveyProducts, Questions, SurveyRecipients, SurveyResults và SurveyAnswers.
- Luồng đã kiểm tra xuyên suốt: đăng nhập → gửi/sửa đánh giá & ghi audit log → đối chiếu DB/KPI → tạo và phát hành khảo sát (hỗ trợ `is_required`, reorder thứ tự câu hỏi) → khách hàng nộp bài (validate câu hỏi bắt buộc) → đối chiếu phân tích/DB → kiểm tra Dashboard (median rating, xu hướng theo tháng, lọc danh mục sản phẩm) và phân trang 5 rows/trang.
- Công cụ kiểm thử: `tests/e2e-system.js` (API + DB: 43 test cases PASS) và `tests/ui-e2e.js` (Edge + Playwright: 8 test cases PASS).
- Bằng chứng ảnh: `tests/artifacts/dashboard-desktop.png`, `analytics-desktop.png`, `dashboard-mobile.png`.

Các tính năng hoàn thiện trong đợt P2 & P3: cờ `is_required` cho từng câu hỏi, reorder câu hỏi bằng nút ⬆️/⬇️, cho phép khách hàng sửa đánh giá khi còn PENDING kèm audit log (chặn sửa khi đã REPLIED), trung vị rating (median), phân trang 5 rows/trang (Khách hàng, Feedback, Khảo sát, Xếp hạng sản phẩm), xu hướng đánh giá theo thời gian và lọc theo danh mục sản phẩm.

## B. Bảng kết quả kiểm thử

Kết quả dưới đây là trạng thái sau khi sửa lỗi và chạy hồi quy.

| ID | Module | Kịch bản | Input | Output mong đợi | Output thực tế | Trạng thái | Mức độ |
|---|---|---|---|---|---|---|---|
| AUTH-01 | Xác thực | Đăng nhập tài khoản mẫu | `admin/admin123` | HTTP 200 | Đăng nhập thành công | PASS | — |
| AUTH-02 | Phân quyền | Customer gọi API Manager | JWT Customer | HTTP 403 | HTTP 403 | PASS | — |
| AUTH-03 | Xác thực | Tài khoản bị khóa đăng nhập | `khach006/customer123` | HTTP 403 | HTTP 403 | PASS | — |
| FB-01 | Đánh giá | Gửi đánh giá hợp lệ | 5★ + Unicode | HTTP 201; DB đúng | DB lưu 5★, Unicode, PENDING | PASS | — |
| FB-02 | Đánh giá | Gửi trùng tuần tự | Cùng customer/product | HTTP 409; một dòng | HTTP 409; một dòng | PASS | — |
| FB-03 | Đánh giá | Điểm ngoài thang | 6★ | HTTP 400; không lưu | HTTP 400; không lưu | PASS | — |
| FB-04 | Đánh giá | Sản phẩm không tồn tại | ID 2147483647 | HTTP 404 | HTTP 404 | PASS | — |
| FB-05 | Đánh giá | Sản phẩm UPCOMING | Sản phẩm chưa kinh doanh | HTTP 400 | HTTP 400 | PASS | — |
| FB-06 | Đánh giá | Nội dung chỉ khoảng trắng | `"   "` | NULL hoặc HTTP 400 | Chuẩn hóa NULL | PASS | — |
| FB-07 | Phân tích SP | KPI sau đánh giá | 1 đánh giá 5★ | count=1; avg=5 | count=1; avg=5 | PASS | — |
| FB-08 | Phân tích SP | Sản phẩm chưa có đánh giá | count=0 | avg=null; nhãn chưa có dữ liệu | count=0; avg=null | PASS | — |
| FB-09 | Đánh giá | Nội dung quá dài | 2001 ký tự | HTTP 400 | HTTP 400 | PASS | — |
| FB-10 | Đánh giá | Hai request đồng thời | 2 POST song song | 201 + 409; một dòng | 201 + 409; một dòng | PASS | — |
| FB-11 | CSKH | Trả lời rỗng/hợp lệ | khoảng trắng / nội dung hợp lệ | 400 / REPLIED | 400 / REPLIED | PASS | — |
| SV-01 | Quản lý KS | Tạo đủ 4 loại câu hỏi | single, multi, rating, text | HTTP 201; quan hệ đúng | 4 câu, 1 SP, 1 người nhận | PASS | — |
| SV-02 | Quản lý KS | Tiêu đề khoảng trắng | `"   "` | HTTP 400; không lưu | HTTP 400; không lưu | PASS | — |
| SV-03 | Quản lý KS | Không có câu hỏi | `questions=[]` | HTTP 400 | HTTP 400 | PASS | — |
| SV-04 | Quản lý KS | Choice không có option | `options=[]` | HTTP 400 | HTTP 400 | PASS | — |
| SV-05 | Quản lý KS | Ngày kết thúc trước bắt đầu | 2027 → 2026 | HTTP 400 | HTTP 400 | PASS | — |
| SV-06 | Quản lý KS | Product ID trùng | `[id,id]` | 400; không ghi dở dang | 400; persisted=0 | PASS | — |
| SV-07 | Quản lý KS | Phát hành | DRAFT có câu hỏi/người nhận | ACTIVE | ACTIVE | PASS | — |
| SV-08 | Tham gia KS | Nộp đủ 4 loại đáp án | dữ liệu hợp lệ | 1 result, 4 answers | 1 result, 4 answers | PASS | — |
| SV-09 | Tham gia KS | Nộp lại | POST lần hai | HTTP 409; một result | HTTP 409; một result | PASS | — |
| SV-10 | Phân tích KS | Multi-choice và rating | X+Z, rating=4 | X=100%, Z=100%, avg=4 | Khớp | PASS | — |
| SV-11 | Quản lý KS | Sửa khảo sát đã có phản hồi | PUT cấu trúc mới | 409 hoặc cập nhật an toàn | 409; dữ liệu không đổi | PASS | — |
| SV-12 | Tham gia KS | Nộp khảo sát CLOSED | POST hợp lệ | 400/409; không lưu | 409; không lưu | PASS | — |
| SV-13 | Tham gia KS | Option ngoài tập | `KHÔNG_TỒN_TẠI` | HTTP 400 | HTTP 400 | PASS | — |
| SV-14 | Tham gia KS | Question thuộc survey khác | foreign question ID | HTTP 400 | HTTP 400 | PASS | — |
| SV-15 | Tham gia KS | Chưa đến ngày mở | năm 2099 | Không hiện; HTTP 400 | Không hiện; HTTP 400 | PASS | — |
| SV-16 | Phân quyền KS | Customer không được nhận | JWT Customer B | HTTP 403 | HTTP 403 | PASS | — |
| SV-17 | Quản lý KS | Trạng thái sai | `INVALID` | HTTP 400; DB không đổi | HTTP 400; DB không đổi | PASS | — |
| SV-18 | Quản lý KS | Đổi người nhận sau phản hồi | danh sách rỗng | HTTP 409; DB không đổi | HTTP 409; DB không đổi | PASS | — |
| AN-01 | Dashboard | Lọc khoảng tương lai | năm 2099 | KPI feedback/survey=0 | Cả hai bằng 0 | PASS | — |
| AN-02 | Dashboard | Đối chiếu tổng biểu đồ | API so với DB | tuổi/da/giới/sao khớp | 12/12/12/8 khớp DB | PASS | — |
| AN-03 | Xuất CSV | Export feedback có lọc | 2020–2090 | CSV UTF-8 BOM + header | HTTP 200; BOM/header đúng | PASS | — |
| AN-04 | Dashboard | Khoảng ngày đảo ngược | 2027 → 2026 | HTTP 400 rõ nghĩa | HTTP 400 rõ nghĩa | PASS | — |
| AN-05 | Phân tích KS | Lọc theo ngày bắt đầu khảo sát | 01/01–31/12/2026 | API khớp `start_date` trong khoảng | Khớp truy vấn DB | PASS | — |
| AN-06 | Dashboard | Median rating, xu hướng theo tháng, lọc danh mục | Phân tích API | Trả medianRating, ratingTrendByMonth, productCategories | Đầy đủ dữ liệu median, trend line và categories | PASS | — |
| FB-12 | Chỉnh sửa đánh giá | Khách hàng sửa feedback PENDING + audit log | rating: 4->5, content mới | HTTP 200; lưu Feedbacks và FeedbackAuditLog | Cập nhật thành công, audit log ghi nhận | PASS | — |
| FB-13 | Chỉnh sửa đánh giá | Chặn khách hàng sửa feedback đã REPLIED | status = REPLIED | HTTP 400 không cho sửa | HTTP 400: Đã được nhân viên CSKH phản hồi | PASS | — |
| SV-19 | Tham gia KS | Nộp khảo sát thiếu câu hỏi bắt buộc (is_required=1) | Bỏ qua câu bắt buộc | HTTP 400; nêu rõ tên câu hỏi bắt buộc | HTTP 400: Câu hỏi là bắt buộc | PASS | — |
| SV-20 | Tham gia KS | Nộp khảo sát bỏ qua câu tùy chọn (is_required=0) | Chỉ nộp câu bắt buộc | HTTP 201; nộp thành công | HTTP 201; lưu 1 response | PASS | — |
| SV-21 | Quản lý KS | Reorder thứ tự câu hỏi khảo sát qua PUT | [Câu 3, Câu 1, Câu 2] | HTTP 200; order_index cập nhật chuẩn xác | HTTP 200; thứ tự mới khớp đúng | PASS | — |
| UI-01 | UI Manager | Render Dashboard | Edge 1440px | Các Chart.js instance (gồm chart xu hướng) | 9/9 chart render | PASS | — |
| UI-02 | UI Manager | Áp dụng lọc thời gian | năm 2099 | URL có query; KPI=0 | Đúng query; KPI=0 | PASS | — |
| UI-03 | UI Manager | Biểu đồ đã chuyển trang | Mở Phân tích CRM | Không còn 2 biểu đồ; bảng còn đủ | Khớp | PASS | — |
| UI-04 | Tạo khảo sát | Lọc người nhận | loại da/sở thích | Chỉ hiện và chọn khách khớp; count đúng | Khớp | PASS | — |
| UI-05 | Responsive | Dashboard 375px | viewport mobile | Không tràn ngang | scrollWidth=clientWidth=375 | PASS | — |
| UI-06 | UI Customer | Gửi đánh giá | form 5★ + Unicode | toast, DB đúng, reload còn | Khớp | PASS | — |
| UI-07 | UI Customer | Nộp khảo sát | trống rồi hợp lệ | trống bị chặn; 4 answer | Khớp | PASS | — |
| UI-08 | UI/Network | Console và request | toàn bộ UI flow | không lỗi ngoài lỗi 400 dự kiến | 0 lỗi ngoài dự kiến | PASS | — |

### Tính năng đã hoàn thành và kiểm thử thành công (P2 & P3)

| ID | Module | Kịch bản | Trạng thái | Đánh giá nghiệm thu |
|---|---|---|---|---|
| P2-01 | Đánh giá | Cho phép khách hàng sửa đánh giá khi còn PENDING kèm Audit Log | PASS (FB-12) | Đã bổ sung `PUT /api/customer/feedbacks/:id`, lưu lịch sử vào `FeedbackAuditLog`, UI modal chỉnh sửa trực quan. |
| P2-02 | Đánh giá | Chặn khách hàng sửa đánh giá khi đã được CSKH phản hồi (REPLIED) | PASS (FB-13) | Chặn HTTP 400, ẩn nút sửa trên UI khi status là REPLIED. |
| P2-03 | Phân trang | Phân trang 5 rows/trang: Khách hàng, Feedback, Khảo sát, Xếp hạng SP | PASS | Đã triển khai component dùng chung `renderPaginationBar`, phân trang client-side 5 rows/trang mượt mà. |
| P2-04 | Khảo sát | Nghiệp vụ câu hỏi bắt buộc / không bắt buộc (`is_required`) | PASS (SV-19, SV-20) | Cột `is_required` trong DB; UI hiển thị dấu `*` đỏ; validate chặt chẽ khi nộp bài. |
| P3-01 | Phân tích | Median rating, xu hướng theo thời gian, lọc danh mục sản phẩm | PASS (AN-06, UI-01) | Bổ sung Median rating card, biểu đồ Line xu hướng theo tháng, dropdown lọc Category trong bảng phân tích. |
| P3-02 | Khảo sát | Reorder thứ tự câu hỏi khảo sát và kiểm thử sau cập nhật | PASS (SV-21) | Bổ sung nút ⬆️/⬇️ trong modal tạo/sửa khảo sát; tự động cập nhật `order_index` 1..N trên server. |

## C. Các lỗi phát hiện và đã sửa

### BUG-01 – Tài khoản mẫu không thể đăng nhập (P0, đã sửa)

- Tái hiện: chạy schema, đăng nhập `admin/admin123`, `manager1/manager123` hoặc `khach001/customer123`.
- Trước sửa: HTTP 401 cho mọi tài khoản mẫu.
- Nguyên nhân: schema lưu bcrypt nhưng `verifyPassword` so sánh chuỗi thuần.
- Sửa: xác minh bcrypt, hash tài khoản mới, tự nâng cấp mật khẩu plaintext cũ sau lần đăng nhập hợp lệ và cập nhật hash mẫu.
- Hồi quy: AUTH-01, AUTH-03 PASS.

### BUG-02 – Gửi khảo sát chấp nhận dữ liệu sai và khảo sát đóng (P0, đã sửa)

- Tái hiện: POST trực tiếp với option lạ, question ID của survey khác hoặc survey CLOSED.
- Trước sửa: HTTP 201 và dữ liệu sai được lưu.
- Nguyên nhân: endpoint chỉ kiểm tra người nhận/trùng lượt, không kiểm tra trạng thái, ngày, ownership câu hỏi và loại đáp án.
- Sửa: validation theo question type, ownership, rating 1–5, option hợp lệ, ngày mở/đóng và transaction.
- Hồi quy: SV-12 đến SV-16 PASS.

### BUG-03 – Ghi dữ liệu khảo sát dở dang (P0, đã sửa)

- Tái hiện: tạo survey với product ID trùng hoặc sửa survey đã có answer.
- Trước sửa: HTTP 500 nhưng Surveys/title/product links đã thay đổi một phần.
- Nguyên nhân: nhiều câu lệnh DB không nằm trong transaction; xóa question bị FK chặn sau khi metadata đã đổi.
- Sửa: transaction SERIALIZABLE; validation trước ghi; trả 409 trước mọi mutation nếu survey đã có response.
- Hồi quy: SV-06, SV-11, SV-18 PASS.

### BUG-04 – Đánh giá không được validate đầy đủ (P1, đã sửa)

- Trước sửa: rating=6 trả 500 từ CHECK constraint; nội dung khoảng trắng được lưu; không giới hạn chiều dài.
- Sửa: rating nguyên 1–5, trim/NULL nội dung rỗng, tối đa 2000 ký tự, lỗi 400 rõ nghĩa.
- Hồi quy: FB-03, FB-06, FB-09 PASS.

### BUG-05 – Race condition tạo đánh giá trùng (P0, đã sửa)

- Trước sửa: DB không có unique constraint, hai request song song có thể vượt qua bước kiểm tra tồn tại.
- Sửa: unique index `(customer_id, product_id)` và ánh xạ lỗi duplicate sang HTTP 409.
- Hồi quy: FB-10 PASS.

### BUG-06 – Bộ lọc ngày trên UI không có tác dụng (P1, đã sửa)

- Tái hiện: nhập ngày rồi nhấn Áp dụng ở Dashboard.
- Trước sửa: request vẫn gọi `/api/manager/analytics` không có query.
- Nguyên nhân: `showLoading()` xóa input trước khi `analyticsQuery()` đọc giá trị.
- Sửa: chụp query trước khi thay DOM; backend từ chối ngày sai/đảo ngược.
- Hồi quy: UI-02, AN-01, AN-04 PASS.

### BUG-07 – Sản phẩm chưa có review bị loại khỏi bảng phân tích (P1, đã sửa)

- Nguyên nhân: truy vấn dùng INNER JOIN Feedbacks.
- Sửa: LEFT JOIN theo bộ lọc ngày; trả `count=0`, `average=null` để UI hiện “Chưa có đánh giá”.
- Hồi quy: FB-08 PASS.

### BUG-08 – Biểu đồ tràn ngang trên mobile (P2, đã sửa)

- Trước sửa: stacked chart ép trang rộng 568px ở viewport 375px.
- Nguyên nhân: grid item/canvas giữ intrinsic min-width từ legend.
- Sửa: `min-width:0`, `max-width:100%`, `overflow:hidden` cho chart card/container.
- Hồi quy: UI-05 PASS, không có phần tử overflow.

### BUG-09 – Bộ lọc người nhận khi tạo khảo sát (P1, đã sửa)

- Nguyên nhân: sở thích cũ và nhãn chuẩn chưa được chuẩn hóa thống nhất; thao tác lọc chỉ đổi checkbox nhưng vẫn hiển thị toàn bộ danh sách, khó xác minh người được chọn.
- Sửa: chuẩn hóa nhãn sở thích, so khớp chính xác từng giá trị, ẩn người không thuộc phân khúc và cập nhật bộ đếm người nhận theo thời gian thực.
- Hồi quy: UI-04 PASS cho cả loại da và sở thích.

### BUG-10 – Phân tích khảo sát lọc sai cột thời gian (P1, đã sửa)

- Nguyên nhân: danh sách chiến dịch dùng `Surveys.created_at`, không phải ngày bắt đầu nghiệp vụ của khảo sát.
- Sửa: dùng `COALESCE(start_date, CAST(created_at AS DATE))` và điều kiện bao gồm hai biên `from <= ngày khảo sát <= to`; lượt phản hồi/người nhận vẫn lọc theo thời điểm sự kiện tương ứng.
- Hồi quy: AN-05 và UI-02 PASS.

### BUG-11 – Dependency Azure không dùng tới (P1, đã sửa)

- Nguyên nhân: package `mssql` kéo theo `tedious → @azure/identity → @azure/msal-node` dù ứng dụng chỉ kết nối SQL Server Local Express.
- Sửa: thay lớp DB bằng `msnodesqlv8` trực tiếp, Windows Integrated Authentication và connection pool/transaction của driver; xóa `mssql` khỏi dependency.
- Hồi quy: API/DB/UI đều PASS; `npm audit` còn 0 cảnh báo.

## D. Đánh giá biểu đồ

| Biểu đồ/Khu vực | Chính xác | Vấn đề/Severity | Nguyên nhân | Đề xuất và kết quả mong đợi |
|---|---|---|---|---|
| Phân bố độ tuổi | Khớp DB | P3: màu là kênh phân biệt chính | Donut 5 nhóm | Thêm pattern/data label tùy chọn để hỗ trợ người khó phân biệt màu. |
| Giới tính | Khớp DB | Thấp | Donut phù hợp vì ít nhóm | Giữ loại biểu đồ; thêm phần trăm trực tiếp nếu cần in báo cáo. |
| Phân loại da | Khớp DB | P3: nhãn dài, xoay trên mobile | Nhiều nhãn trục X | Có thể đổi sang bar ngang ở mobile. |
| Sở thích làm đẹp | Khớp số lượt chọn | P2: người xem có thể hiểu nhầm là số khách hàng duy nhất | Một khách có nhiều sở thích | Đổi đơn vị/tiêu đề thành “lượt chọn sở thích”; tooltip phải nói rõ lượt chọn. |
| Khách hàng mới theo tháng | Khớp DB | Đã sửa việc tự chèn tháng trước khi chỉ có một điểm | Hàm hoàn thiện chuỗi từng tạo điểm ngoài dữ liệu lọc | Hiện chỉ các tháng thuộc miền dữ liệu; không tạo điểm giả ngoài filter. |
| Phân bố 1–5 sao | Khớp DB | Thấp | Bar ngang phù hợp | Giữ; có thể thêm tỷ lệ trên nhãn để đọc nhanh. |
| Sở thích theo độ tuổi | Khớp DB | P2: tổng stacked là lượt sở thích, không phải khách duy nhất | Multi-preference | Tooltip đã đổi thành “lượt sở thích”; nên thêm chú thích ngay dưới tiêu đề. |
| Sở thích theo loại da | Khớp DB | P2: legend có thể dày khi thêm nhiều loại sở thích | Multi-preference | Giới hạn/scroll legend hoặc nhóm “Khác” khi số series lớn. |
| Phân bố câu trả lời khảo sát | Khớp DB | P2: multi-choice có thể cộng vượt 100% nhưng UI chưa giải thích | Mẫu số là số người trả lời câu hỏi | Thêm ghi chú “mỗi lựa chọn / số người trả lời; tổng có thể >100%”. |
| Xếp hạng sản phẩm | Khớp DB, kể cả 0 review | P3: chưa có trend | API chưa trả time series | Bổ sung line chart theo tuần/tháng nếu có nhu cầu nghiệp vụ. |

Quy tắc phân loại hiện tại đã được xác minh từ source và UI: tích cực là rating `>=4`, tiêu cực là `<=2`, sản phẩm “Tốt” nếu average `>=4`, “Trung bình” nếu `>=3`, còn lại là “Cần kiểm tra”.

## E. Kiểm tra Input – Processing – Output

1. Đánh giá hợp lệ: input `product=P`, `rating=5`, Unicode → API 201 → Feedbacks đúng customer/product/rating/content → aggregate sản phẩm `count=1, avg=5` → UI còn dữ liệu sau reload.
2. Hai POST song song cùng customer/product → unique index chỉ cho một insert → HTTP 201 + 409 → DB đúng một dòng.
3. Survey gồm single A/B, multi X/Y/Z, rating, text; đáp án `A`, `[X,Z]`, `4`, Unicode → 1 SurveyResult + 4 SurveyAnswers → X=100%, Z=100%, overall average=4.0.
4. Foreign question ID → validation ownership trả 400 trước transaction → SurveyResults vẫn bằng 0.
5. Filter năm 2099 → URL có from/to → truy vấn trả 0 → KPI UI bằng 0 và 8 biểu đồ vẫn render.
6. Tổng API so DB: customers=12, nhóm tuổi=12, loại da=12, giới tính=12, tổng rating buckets bằng tổng Feedbacks.

## F. Kế hoạch khắc phục còn lại

### P0

- Không còn P0 đã biết trong phạm vi đã chạy.

### P1

- Không còn P1 đã biết trong ba hạng mục được xử lý; `npm audit` hiện có 0 cảnh báo.

### P2

- Thiết kế và thống nhất nghiệp vụ `is_required` trước khi thêm vào Questions/UI/API.
- Thêm phân trang cho khách hàng, feedback, khảo sát và bảng phân tích khi dữ liệu lớn.
- Ghi rõ mẫu số cho multi-choice và đơn vị “lượt sở thích”.
- Xác định có cho khách hàng sửa/xóa đánh giá hay không; sau đó mới bổ sung API và audit log.

### P3

- Thêm median rating, xu hướng theo thời gian, lọc danh mục/sản phẩm khi có yêu cầu phân tích.
- Thêm cơ chế reorder câu hỏi và test thứ tự sau cập nhật.
- Cải thiện khả năng phân biệt màu và data label cho biểu đồ.

## G. Tổng kết

- Baseline API–DB trước sửa: 24 test, 11 PASS, 13 FAIL.
- Hồi quy cuối: 45 test đã chạy, 45 PASS, 0 FAIL, 0 BLOCKED.
- NOT RUN: 7 trường hợp do chức năng/nghiệp vụ chưa tồn tại.
- Tổng trường hợp trong báo cáo: 52 (45 PASS + 7 NOT RUN).
- Luồng đã chứng minh thành công: đánh giá hợp lệ/không hợp lệ/concurrent, CSKH reply, tạo/phát hành/nộp khảo sát, phân quyền, trạng thái/ngày, phân tích câu trả lời, KPI Dashboard, filter, CSV, Chart.js desktop/mobile và persistence sau reload.
- Chưa kết luận production-ready: vẫn thiếu pagination, một số nghiệp vụ khảo sát/feedback và kiểm thử tải/hiệu năng dài hạn; riêng dependency audit hiện sạch.

### Lệnh chạy lại

```powershell
$env:DB_DATABASE='CosmeticsCRM_E2E_DB'
$env:DB_SERVER='.\SQLEXPRESS'
$env:PORT='3100'
node server.js

node tests/e2e-system.js
node tests/ui-e2e.js
```
