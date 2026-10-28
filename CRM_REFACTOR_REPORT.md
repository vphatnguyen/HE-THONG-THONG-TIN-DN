# Báo cáo refactor UI/UX, CRUD và kiểm thử CRM

Ngày: 28/10/2026, UTC+7. **174/174 ca PASS, 10/10 bộ kiểm thử PASS; thêm 6 kiểm tra migration và 5 kiểm tra schema mới PASS** trong lần hồi quy cuối. Chi tiết kết quả thực chạy ở báo cáo B và JSON đính kèm.

**Chưa đóng toàn bộ yêu cầu:** quy tắc xóa chiến dịch đã có kết quả còn chờ quyết định. Không triển khai production, không thử xóa trên database chính.

## Phân tích dự án và phạm vi

- Giữ JavaScript thuần/HTML/CSS, Express, SQL Server Express, msnodesqlv8, JWT và Chart.js. Đã đọc frontend, API, schema, lớp database, tài liệu nghiệp vụ và các test cũ; không đổi framework hay kiến trúc.
- Quan hệ chính: Accounts → Customers → Feedbacks/SurveyResults; Products → Feedbacks/SurveyProducts; Surveys → Questions/SurveyProducts/SurveyRecipients/SurveyResults; SurveyResults → SurveyAnswers.
- Chiến dịch và biểu mẫu hiện là **cùng thực thể Surveys**, gồm nhiều sản phẩm và một tập Questions. Không tự tạo thêm hai thực thể riêng.
- Không có nháp câu trả lời Customer. Feedback có PENDING/REPLIED, không có trạng thái CLOSED hoặc API xóa feedback. Đóng nhận đánh giá là thao tác ngừng bán sản phẩm theo nghiệp vụ cũ.
- Ban đầu khảo sát trên CosmeticsCRM_E2E_DB. Hồi quy cuối dùng **CosmeticsCRM_Refactor_E2E_DB**, tạo mới từ schema bằng UTF-8. Tất cả thao tác ghi/xóa kiểm thử nằm trong DB riêng.
- Xem thử tại **http://localhost:3101**. `CosmeticsCRM_DB` chưa áp dụng migration: kiểm tra chỉ đọc xác nhận Accounts.record_version và Feedbacks.replied_at vẫn chưa tồn tại. Không khởi động lại tiến trình trỏ DB chính.

## Báo cáo A – Kết quả chỉnh sửa

| Module | Vấn đề ban đầu | Nội dung đã sửa | Trạng thái |
|---|---|---|---|
| Customer Management | Thiếu ID hồ sơ; nhấp đúp mở sửa; thông tin phụ nhiều | Bảng 6 cột; hiển thị ID khách hàng, ẩn ID tài khoản ở detail; click hàng đọc; sửa riêng; tìm ID/tên/email; ngày/sort/phân trang | Đã kiểm thử |
| Customer Management – hồ sơ | Sửa mất các sở thích ngoài mục đầu tiên; bỏ trường có thể xóa dữ liệu cũ | Checkbox nhiều sở thích; giữ trường không gửi; transaction account/profile; ID bất biến; kiểm tra version khi lưu | Đã kiểm thử |
| Feedback Management | Nội dung và ô phản hồi nằm trong danh sách; ghi đè thiếu lịch sử | Bảng 7 cột; detail đầy đủ; sửa phản hồi theo quyết định người dùng; audit nội dung trước/sau, Manager và timestamp; chống retry trùng/bản sửa cũ | Đã kiểm thử |
| Survey Campaign | Thẻ dài hiển thị sản phẩm; thiếu tìm/lọc; nhấp đúp sửa | Bảng ID/tên/trạng thái/bắt đầu/kết thúc/lượt tham gia/thao tác; sản phẩm/câu hỏi ở detail; tìm ID/tên, trạng thái/ngày bắt đầu, sort, phân trang | Đã kiểm thử; chính sách xóa có kết quả còn chờ |
| Customer Feedback | Nội dung dài trên thẻ, chưa có detail riêng | Bảng 6 cột; popup theo chủ sở hữu, đánh giá và trả lời Manager; ẩn ID/audit/lịch sử quản trị; sửa khi PENDING; lọc sao/trạng thái/ngày và tìm ID | Đã kiểm thử |
| Customer Survey | Bài đóng/hết hạn biến mất; không đọc lại câu trả lời | Bảng 6 cột; hạn, trạng thái tham gia, thời gian hoàn thành; detail câu hỏi và câu trả lời cá nhân; giữ lịch sử, khóa nộp lại | Đã kiểm thử |
| Accounts nội bộ | Nhấp đúp sửa; chưa xử lý sửa đồng thời/Admin ACTIVE cuối | Ẩn ID tài khoản ở bảng/detail/sort; click đọc detail; sửa riêng; ngày/sort; version; bảo vệ Admin ACTIVE cuối; giữ xem mật khẩu theo lựa chọn người dùng | Đã kiểm thử |
| Products | Thiếu click hàng đọc detail; xóa gỡ liên kết khảo sát | Detail đầy đủ; bỏ mô tả dài khỏi bảng; nút không lan click; giữ liên kết và ngừng bán khi có feedback/khảo sát; validate giá/NCC | Đã kiểm thử |
| Suppliers | Bảng nhiều số liệu phụ, thiếu detail | Bảng 6 cột; detail liên hệ/địa chỉ/thống kê; ngày/sort; giữ ngừng hợp tác/ngừng sản phẩm; transaction/version | Đã kiểm thử |
| Dashboard/Analytics | Request/chart callback có thể chạy sau chuyển trang | Guard response và callback cũ, hủy chart khi điều hướng; lọc dd/mm/yyyy dùng Áp dụng; tính trọn ngày kết thúc; chú thích mốc ngày; ẩn menu CSV, giữ API tương thích | Đã kiểm thử |
| Dùng chung | Lặp bố trí, thiếu điều phối request | crud.js dùng chung cho bảng/detail/ngày/sort/reset/row keyboard; api() gộp request ghi trùng, disable nút và xử lý hết phiên | Đã kiểm thử |
| Database | Email UNIQUE chỉ cho một NULL; thiếu timestamp/version | Migration không xóa dữ liệu: lịch sử phản hồi, timestamp, ROWVERSION, unique index email không NULL; transaction luồng nhiều bảng | Đã kiểm thử trên DB riêng |

### Phạm vi thu gọn đã được người dùng xác nhận

| Thuộc tính | Đã triển khai |
|---|---|
| Hạng thành viên | Bỏ khỏi UI/API/schema tạo mới; migration riêng xóa Customers.membership_tier |
| Tồn kho | Bỏ khỏi UI/API/validation/sort/CRUD/schema tạo mới; migration riêng xóa Products.stock_quantity |
| Ngày tạo hồ sơ | Ẩn trong UI, giữ Customers.created_at trong DB và metadata API; ngày tạo tài khoản vẫn hiển thị |
| Điểm trung bình khách hàng | Bỏ khỏi detail và query quản lý khách; giữ điểm sao/thống kê của sản phẩm và khảo sát |
| Trạng thái sản phẩm | Nhãn Đang bán/Ngừng bán trên danh sách, detail, form, bộ lọc và chọn sản phẩm khảo sát; giữ mã OFFICIAL/UPCOMING |

[Migration xóa các cột đã duyệt](database/migrations/20261028_remove_commerce_fields.sql) phải chạy riêng, không tự chạy lúc khởi động. Đã áp dụng và kiểm thử trên DB test; chưa chạy trên CosmeticsCRM_DB. Payload client cũ gửi stock/stock_quantity được bỏ qua để giữ tương thích; response không còn tồn kho và sort theo tồn kho trả 400.

Khi kiểm tra màn hình sản phẩm, phát hiện nút sửa vẫn hiện với feedback REPLIED. Đã ẩn nút và chặn mở form để khớp quy tắc backend hiện có; UX25 kiểm tra cả hiển thị trạng thái, bỏ tồn kho, giữ thống kê sao và không hiện nút sửa sau phản hồi.

### Điều chỉnh giao diện theo yêu cầu mới

| Yêu cầu | Kết quả |
|---|---|
| Ẩn ID tài khoản | Bỏ cột ID tài khoản nội bộ, trường ID trong detail và lựa chọn sort theo ID; khách hàng chỉ giữ ID hồ sơ. Khóa liên kết trong API/DB giữ nguyên |
| Ẩn thuộc tính ảnh | Bỏ image_url trong detail sản phẩm. Giao diện dùng biểu tượng theo danh mục; không có form upload. Không xóa dữ liệu ảnh cũ |
| Khoảng ngày | Ngày bắt đầu ≤ ngày bản ghi ≤ ngày kết thúc, tính cả hai đầu. Bộ lọc nhập/hiển thị dd/mm/yyyy, gửi ISO lên API; báo ngày sai/ngày đảo |
| Toàn bộ cuối ngày | Dashboard và API export so sánh DATE ở cận trên, nhận cả DATETIME2 lúc 23:59:59.9999999; test đối chiếu trước/đầu/cuối/sau ngày |
| Bộ lọc trùng | Bỏ sort dùng chung lặp với sort sản phẩm; mỗi danh sách một nút reset chung; bỏ quick-tab số sao lặp dropdown ở Feedback Manager |
| CSV | Ẩn toàn bộ menu/nút CSV và bỏ hàm tải frontend; endpoint cũ giữ tương thích, kiểm thử API cũ vẫn PASS |
| Dashboard | Chú thích ngày dùng cho từng chỉ số: hồ sơ/tài khoản, đánh giá, chiến dịch, kết quả và lời mời. Bảng hiệu quả chiến dịch vẫn là tổng tích lũy của các chiến dịch được lọc |
| Sở thích | Chờ người dùng chọn một hay nhiều. Đề xuất nhiều ở đăng ký/thêm khách/hồ sơ. Mỗi khách chỉ tính một lần ở từng sở thích, tổng các nhóm có thể vượt số khách. Chưa đổi radio đăng ký hoặc select thêm khách |

Không chạy migration mới và không sửa dữ liệu thật cho các yêu cầu chỉ ẩn giao diện. Các thao tác DB của kiểm thử nằm trong CosmeticsCRM_Refactor_E2E_DB.

### Quy tắc được giữ hoặc đã xác nhận

- Một feedback/khách/sản phẩm. PENDING được sửa và ghi audit; REPLIED không cho Customer sửa. Không tạo nút/API xóa feedback giả.
- **Cho sửa phản hồi Manager**, theo lựa chọn người dùng. Lưu nội dung trước/sau và người xử lý; UI gửi nội dung cũ để phát hiện xung đột; retry giống hệt không tăng số lịch sử.
- **Giữ liên kết sản phẩm với khảo sát, chuyển ngừng bán**, theo lựa chọn người dùng, kể cả sản phẩm chưa có feedback.
- Khách có lịch sử giữ nghiệp vụ khóa, không xóa lịch sử; frontend bỏ nút xóa có cùng tác dụng với nút khóa. Khách chưa tương tác mới có xóa thật và xác nhận.
- **Giữ xem mật khẩu** theo lựa chọn người dùng. Bcrypt cũ không thể giải mã: ô sửa để trống và giải thích chỉ đặt lại. Chuỗi hash không được dùng thay mật khẩu khi đăng nhập.

### API và schema

- Giữ endpoint cũ và kiểu array của list. Thêm GET detail feedback cho Manager/Customer, kiểm tra chủ sở hữu ở Customer.
- List API thêm from/to, sort_by/sort_dir, page/page_size và X-Total-Count. Frontend tiếp tục phân trang client theo kiến trúc cũ. Phân trang API bổ sung thực hiện trên kết quả query; chưa tối ưu OFFSET/FETCH cho dữ liệu lớn.
- Form UI gửi `_version`; backend kiểm tra ROWVERSION trong transaction và trả 409 nếu bản ghi đã thay đổi. Client cũ không gửi điều kiện vẫn gọi được API; không cam kết chống mất cập nhật cho client cũ không gửi version.
- Thêm FeedbackReplyHistory và replied_at/updated_at. Không đoán timestamp cho phản hồi cũ; hiển thị rõ khi chưa ghi nhận.
- [Migration](database/migrations/20261028_crm_integrity.sql) chạy từ ensureAppSchema khi khởi động với DB đã cấu hình. Chạy lại an toàn, không DROP dữ liệu ứng dụng. Schema tạo mới vẫn là script cài đặt có DROP bảng; chỉ dùng cho DB mới/test.

### Bộ lọc giá theo nghìn — cập nhật mới nhất

- Nhập 150 được hiểu là 150.000đ; rời ô hiển thị dạng tiền, bấm vào sửa trở lại 150. Không nhân nghìn lặp lại.
- Theo yêu cầu cuối, không thêm nút Lọc giá. Khoảng giá tự lọc sau khi ngừng nhập 300 ms; vẫn kết hợp tìm kiếm, trạng thái và sắp xếp.
- Chặn số âm, chữ, số vượt phạm vi và giá từ lớn hơn giá đến; giữ điều kiện hợp lệ trước đó. Xóa ô/Reset bỏ giới hạn giá.
- Kiểm thử riêng sau chỉnh sửa: **5/5 ca PRICE PASS**, giao diện desktop và 375px; chỉ đọc API trên DB E2E. Đã đưa 5 ca UI giá vào test:all; lần hồi quy mới nhất chạy 174 ca của 10 bộ kiểm thử, đều PASS.
- [Kết quả](tests/artifacts/product-price-results.json), [desktop](tests/artifacts/product-price-filter.png), [mobile](tests/artifacts/product-price-mobile.png). Chạy lại: DB_DATABASE=CosmeticsCRM_Refactor_E2E_DB và E2E_BASE_URL=http://localhost:3101, rồi node tests/product-price-ui.js.

### Tinh gọn thao tác Manager và thống nhất tên Feedback

| Khu vực | Kết quả |
|---|---|
| Chiến dịch khảo sát | Bỏ nút Người nhận và Đóng ở bảng. Form Sửa chứa người nhận/trạng thái. Khảo sát có câu trả lời vẫn mở Sửa để đổi trạng thái, nhưng chỉ xem nội dung/người nhận; giữ nguyên khóa nghiệp vụ backend |
| Khách hàng | Cột thao tác rộng cố định, sticky bên phải; nút Sửa và Xóa nằm ở hai vị trí cố định. Ẩn nút Khóa/Mở khóa ngoài bảng; dùng Trạng thái trong form sửa |
| Phân tích sản phẩm | Bỏ nút/cột Xem người đánh giá; click hoặc Enter trên dòng mở danh sách feedback, click feedback mở detail và trả lời; badge lọc riêng không lan click lên dòng |
| Phân tích khảo sát | Bỏ nút/cột Chi tiết; click hoặc Enter trên dòng mở kết quả khảo sát |
| Tên gọi | Dùng Feedback cho nội dung khách gửi, Trả lời feedback cho nội dung Manager gửi lại. Rà soát UI Manager/Customer, thông báo API và hướng dẫn; giữ mã trạng thái/API/DB |
| Dữ liệu | Chi tiết API khảo sát bổ sung response_count để form biết trạng thái được sửa. Không migration mới; không sửa dữ liệu thật |

Ca UX29–UX33 đã kiểm tra click/bàn phím, ID feedback đúng, lưu người nhận/trạng thái và bảo toàn câu hỏi/kết quả cũ. [Ảnh cột thao tác](tests/artifacts/manager-customer-actions.png), [ảnh phân tích](tests/artifacts/analytics-desktop.png).

### Bộ câu hỏi mẫu, người nhận và popup Customer

| Yêu cầu | Kết quả |
|---|---|
| Lưu bộ mẫu | Trong Tạo chiến dịch: soạn câu hỏi → Lưu danh sách thành bộ mẫu → nhập tên → Lưu bộ mẫu. Mẫu lưu DB theo tài khoản Manager và dùng lại ở phiên/thiết bị khác |
| Nạp mẫu | Chọn bộ mẫu đã lưu → Dùng bộ mẫu. Giữ thứ tự, 4 loại câu hỏi, lựa chọn và dấu bắt buộc. Cần xác nhận trước khi thay câu hỏi đang soạn; chiến dịch nhận bản sao độc lập |
| Validation | Tên 1–100 ký tự, không trùng trong cùng tài khoản; kiểm tra câu hỏi, lựa chọn, nội dung trùng; unique constraint chống tạo trùng đồng thời. Lỗi lưu giữ nguyên form |
| Người nhận | Ẩn dòng email/số điện thoại ở thẻ chọn người nhận trong cả tạo và sửa. Giữ tên, tài khoản, phân nhóm và các thao tác chọn/lọc |
| Popup feedback Customer | Tách khỏi màn hình Manager: biểu tượng/sản phẩm, sao/ngày/nội dung của chính khách, reply Manager mới nhất. Không ID, audit hay lịch sử quản trị; PENDING vẫn sửa được, REPLIED chỉ đọc |
| Quyền và dữ liệu | GET/POST /api/manager/question-templates chỉ dành cho Manager và phạm vi chủ sở hữu. Mẫu không gắn khóa ngoại với chiến dịch. Chi tiết feedback vẫn lọc theo khách đang đăng nhập |

[Migration bổ sung](database/migrations/20261028_question_templates.sql) tạo bảng SurveyQuestionTemplates nếu chưa có, không xóa dữ liệu; chạy từ ensureAppSchema theo DB cấu hình khi khởi động. Đã áp dụng/thử chạy lại trên DB test và thử bootstrap schema mới; chưa chạy trên DB chính. Mẫu riêng được xóa theo tài khoản chủ sở hữu nếu tài khoản bị xóa.

Kiểm thử mới CRM58–CRM63 và UX34–UX37 bao gồm DB lưu/đọc lại, phân quyền, tên trùng/gửi đồng thời, giữ mẫu khi sửa chiến dịch, nạp sau đăng nhập lại, lỗi API giữ form, ẩn liên hệ và popup 375px.

[Ảnh bộ câu hỏi mẫu](tests/artifacts/question-template-create.png), [popup Customer](tests/artifacts/customer-feedback-popup.png), [popup mobile](tests/artifacts/customer-feedback-mobile.png).

## Báo cáo B – Kiểm thử chức năng

| Bộ kiểm thử | Kết quả thực tế | Trạng thái |
|---|---|---|
| Unit | 18/18 ca | PASS |
| API/DB cũ | 43/43 ca | PASS |
| API/DB mở rộng | 63/63 ca | PASS |
| UI cũ | 8/8 ca | PASS |
| UI CRM mở rộng | 37/37 ca | PASS |
| UI giá | 5/5 ca (nằm trong tổng 174) | PASS |
| lean-schema | Script exit 0; 6 kiểm tra migration | PASS |
| pagination-filters | Script exit 0 | PASS |
| admin-api | Script exit 0 | PASS |
| admin-ui | Script exit 0 | PASS |

174 ca (đã gồm 5 ca UI giá) không đếm thêm 6 kiểm tra migration và 5 kiểm tra smoke trên schema mới. Migration được thử với cột legacy/default/CHECK được tạo lại trong DB test, rồi chạy hai lần; giữ nguyên số bản ghi, ngày tạo hồ sơ và thống kê sao sản phẩm. Database tạo mới CosmeticsCRM_Templates_E2E_DB cũng khởi động, khởi tạo bảng mẫu và truy cập API thành công. node --check, git diff --check và DBCC CHECKCONSTRAINTS: PASS.

| Test Case | Thao tác | Kết quả mong đợi | Kết quả thực tế | PASS/FAIL |
|---|---|---|---|---|
| UNIT-01 | combined inclusive date/status/search filters | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-02 | reversed range produces empty result | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-03 | missing dates excluded only when a date constraint exists | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-04 | ID search accepts hash prefix | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-05 | ID search never matches a different ID containing the same digits | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-06 | numeric sort orders IDs numerically without mutating source | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-07 | deterministic ties fall back to ID | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-08 | completed survey stays completed after closure | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-09 | expired active survey cannot be shown as available | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-10 | available survey is pending | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-11 | empty data handled | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-12 | date-only values retain their calendar date | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-13 | ISO timestamps are filtered by the displayed local calendar date | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-14 | test harness rejects production database before any fetch | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-15 | product status labels retain API codes and show agreed language | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-16 | Vietnamese date order parses unambiguously and retains leap days | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-17 | invalid calendar dates and incomplete dates are rejected | Đúng bất biến logic | Assertion thành công | PASS |
| UNIT-18 | displayed date ranges compare calendar dates across month and year boundaries | Đúng bất biến logic | Assertion thành công | PASS |
| OLD-AUTH-01 | Tài khoản mẫu đăng nhập theo tài liệu | HTTP 200 cho admin/admin123 | Đăng nhập thành công | PASS |
| OLD-AUTH-02 | Khách hàng gọi API quản lý | HTTP 403 | HTTP 403 | PASS |
| OLD-FB-01 | Gửi đánh giá hợp lệ và đọc lại từ DB | HTTP 201; DB lưu đúng 5 sao và Unicode | {"rating":5,"content":"Sản phẩm rất tốt – kiểm thử Unicode tiếng Việt 🌸","status":"PENDING"} | PASS |
| OLD-FB-02 | Chống gửi trùng tuần tự | HTTP 409; DB chỉ có 1 dòng | HTTP 409; count=1 | PASS |
| OLD-FB-03 | Điểm vượt thang 1–5 | HTTP 400, không phát sinh dữ liệu | HTTP 400; count=0 | PASS |
| OLD-FB-04 | Sản phẩm không tồn tại | HTTP 404 | HTTP 404 | PASS |
| OLD-FB-05 | Sản phẩm chưa kinh doanh | HTTP 400 | HTTP 400 | PASS |
| OLD-FB-06 | Nội dung chỉ chứa khoảng trắng | Chuẩn hóa thành NULL hoặc từ chối 400 | DB content=NULL | PASS |
| OLD-FB-07 | KPI sau khi thêm đánh giá | Sản phẩm QA: count=1, average=5; phân bố 5★ tăng đúng | count=1; average=5; total=29 | PASS |
| OLD-FB-08 | Sản phẩm chưa có đánh giá | API trả count=0, average=null để UI hiển thị “Chưa có đánh giá” | count=0; average=null | PASS |
| OLD-FB-09 | Nội dung vượt 2000 ký tự | HTTP 400; không lưu DB | HTTP 400; count=0 | PASS |
| OLD-FB-10 | Hai request đồng thời cho cùng sản phẩm | Một HTTP 201, một HTTP 409; DB chỉ có 1 dòng | statuses=201,409; count=1 | PASS |
| OLD-FB-11 | Phản hồi rỗng và phản hồi hợp lệ | Rỗng: HTTP 400; hợp lệ: REPLIED và nội dung được trim | HTTP 400 / HTTP 200; status=REPLIED | PASS |
| OLD-FB-12 | Khách hàng sửa đánh giá khi còn PENDING kèm ghi Audit Log | HTTP 200; cập nhật rating/content và lưu FeedbackAuditLog | HTTP 200; rating 4->5; audit log ID=25 | PASS |
| OLD-FB-13 | Chặn khách hàng sửa đánh giá khi đã được CSKH phản hồi (REPLIED) | HTTP 400; không cho sửa | HTTP 400: Đánh giá đã được nhân viên chăm sóc khách hàng trả lời, không thể chỉnh sửa. | PASS |
| OLD-AUTH-03 | Tài khoản bị khóa đăng nhập | HTTP 403 | HTTP 403 | PASS |
| OLD-SV-01 | Tạo khảo sát đủ 4 loại câu hỏi | HTTP 201; quan hệ DB chính xác | survey=153; questions=4; recipients=1 | PASS |
| OLD-SV-02 | Tiêu đề chỉ chứa khoảng trắng | HTTP 400; không lưu DB | HTTP 400; count=0 | PASS |
| OLD-SV-03 | Khảo sát không có câu hỏi | HTTP 400; không lưu DB | HTTP 400; count=0 | PASS |
| OLD-SV-04 | Câu lựa chọn không có đáp án | HTTP 400; không lưu DB | HTTP 400; count=0 | PASS |
| OLD-SV-05 | Ngày kết thúc trước ngày bắt đầu | HTTP 400; không lưu DB | HTTP 400; count=0 | PASS |
| OLD-SV-06 | Sản phẩm trùng lặp không tạo dữ liệu dở dang | HTTP 400; không lưu survey/product link | HTTP 400; persisted=0 | PASS |
| OLD-SV-07 | Phát hành khảo sát | HTTP 200; trạng thái ACTIVE | ACTIVE | PASS |
| OLD-SV-08 | Gửi đủ 4 loại câu trả lời | HTTP 201; DB có 1 result và 4 answer | HTTP 201; results=1; answers=4 | PASS |
| OLD-SV-09 | Gửi lại cùng khảo sát | HTTP 409; vẫn chỉ 1 result | HTTP 409; count=1 | PASS |
| OLD-SV-10 | Phân bố multi-choice dùng mẫu số người trả lời | X=100%, Z=100%; response rate=100%; rating avg=4.0 | X=100%; Z=100%; rate=100%; avg=4.0 | PASS |
| OLD-SV-11 | Chỉnh sửa khảo sát đã có phản hồi phải nguyên tử | Hoặc cập nhật an toàn, hoặc lỗi 409 và không thay đổi dữ liệu | HTTP 409; dữ liệu không đổi | PASS |
| OLD-SV-12 | Không được gửi khảo sát đã đóng | HTTP 400/409; không tạo result | HTTP 409; count=0 | PASS |
| OLD-SV-13 | Đáp án ngoài tập lựa chọn | HTTP 400; không tạo result | HTTP 400; count=0 | PASS |
| OLD-SV-14 | Câu trả lời tham chiếu câu hỏi khảo sát khác | HTTP 400; không tạo result | HTTP 400; count=0 | PASS |
| OLD-SV-15 | Khảo sát chưa đến ngày bắt đầu | Không xuất hiện trong danh sách; submit HTTP 400; không tạo result | Không hiển thị; HTTP 400; count=0 | PASS |
| OLD-SV-16 | Khách hàng không thuộc danh sách người nhận | HTTP 403; không tạo result | HTTP 403; count=0 | PASS |
| OLD-SV-17 | Cập nhật trạng thái không hợp lệ | HTTP 400; trạng thái DB không đổi | HTTP 400; status=ACTIVE | PASS |
| OLD-SV-18 | Đổi người nhận sau khi đã có phản hồi | HTTP 409; danh sách người nhận không đổi | HTTP 409; recipients=1 | PASS |
| OLD-SV-19 | Nộp khảo sát thiếu câu hỏi bắt buộc (is_required = 1) | HTTP 400; thông báo lỗi chỉ rõ câu hỏi bắt buộc | HTTP 400: Câu hỏi "Câu 1 bắt buộc" là bắt buộc, vui lòng trả lời. | PASS |
| OLD-SV-20 | Nộp khảo sát bỏ qua câu hỏi không bắt buộc (is_required = 0) | HTTP 201; nộp thành công chỉ với câu bắt buộc | HTTP 201; submit thành công khi bỏ qua câu hỏi không bắt buộc | PASS |
| OLD-SV-21 | Reorder thứ tự câu hỏi qua PUT khảo sát | HTTP 200; thứ tự và order_index cập nhật chuẩn xác | HTTP 200; thứ tự mới: [Câu Thứ Ba -> Câu Thứ Nhất -> Câu Thứ Hai] | PASS |
| OLD-AN-01 | Bộ lọc thời gian tương lai tác động KPI | Tổng feedback và phản hồi khảo sát bằng 0 | totalFeedbacks=0; totalSurveyResponses=0 | PASS |
| OLD-AN-02 | Đối chiếu tổng biểu đồ với dữ liệu DB | Tổng tuổi/da/giới tính/phân bố sao khớp truy vấn gốc | customers=36; ages=23; skins=12; genders=23; ratings=31 | PASS |
| OLD-AN-03 | Xuất CSV đánh giá theo khoảng thời gian | HTTP 200, content-type CSV, có BOM và tiêu đề | HTTP 200; 31 dòng dữ liệu | PASS |
| OLD-AN-04 | Khoảng ngày đảo ngược | HTTP 400 với thông báo rõ ràng | HTTP 400: Từ ngày phải bằng hoặc trước đến ngày | PASS |
| OLD-AN-05 | Lọc chiến dịch theo ngày bắt đầu khảo sát | Danh sách API khớp start_date trong khoảng; không dùng created_at | 34 khảo sát; start_date nằm trong 2026-01-01..2026-12-31 | PASS |
| OLD-AN-06 | Tính median rating, xu hướng theo tháng và phân loại danh mục | stats.medianRating hợp lệ, ratingTrendByMonth và productCategories đầy đủ | medianRating=5; trends=1 months; categories=[Kem chống nắng, Kem dưỡng da, Mặt nạ, Phấn phủ, QA, Serum, Son môi, Sữa rửa mặt, Test, Toner] | PASS |
| OLD-UI-01 | Đăng nhập Manager và render Dashboard | Dashboard hiển thị các canvas có Chart.js instance (gồm biểu đồ xu hướng mới) | chart-age:doughnut, chart-gender:doughnut, chart-skin:bar, chart-prefs:bar, chart-new-customers:line, chart-ratings:bar, chart-pref-age:bar, chart-pref-skin:bar, chart-rating-trend:line | PASS |
| OLD-UI-02 | Bộ lọc thời gian Dashboard | Khoảng năm 2099 cập nhật KPI về 0 và biểu đồ vẫn render | URL=http://localhost:3101/api/manager/analytics?from=2099-01-01&to=2099-12-31; Tổng khách hàng=0; 8/8 biểu đồ render lại | PASS |
| OLD-UI-03 | Trang Phân tích CRM sau khi chuyển biểu đồ | Không còn 2 biểu đồ sở thích; bảng sản phẩm và khảo sát vẫn có | Không trùng biểu đồ; 2 bảng dữ liệu hiện diện | PASS |
| OLD-UI-04 | Bộ lọc khách hàng khi tạo khảo sát | Lọc đúng loại da/sở thích, giữ lựa chọn và cập nhật bộ đếm | Hiển thị Da dầu=3; Trị mụn=3; tổng đã chọn=37; bộ đếm chính xác | PASS |
| OLD-UI-05 | Dashboard trên màn hình di động | Không tràn ngang viewport; nội dung/biểu đồ vẫn hiện | {"clientWidth":375,"scrollWidth":375,"charts":9,"overflowing":[],"chain":[{"tag":"DIV","id":"","className":"chart-card","left":16,"right":359,"width":343,"padding":"20px","margin":"0px"},{"tag":"DIV","id":"","className":"charts-grid-3x2","left":16,"right":359,"width":343,"padding":"0px","margin":"0px 0px 24px"},{"tag":"DIV","id":"page-content","className":"page-content","left":0,"right":375,"width":375,"padding":"16px","margin":"0px"},{"tag":"MAIN","id":"main-content","className":"main-content","left":0,"right":375,"width":375,"padding":"0px","margin":"0px"},{"tag":"DIV","id":"app","className":"","left":0,"right":375,"width":375,"padding":"0px","margin":"0px"},{"tag":"BODY","id":"","className":"","left":0,"right":375,"width":375,"padding":"0px","margin":"0px"},{"tag":"HTML","id":"","className":"","left":0,"right":375,"width":375,"padding":"0px","margin":"0px"}]} | PASS |
| OLD-UI-06 | Gửi đánh giá sản phẩm qua giao diện | Toast thành công, DB lưu đúng và dữ liệu còn sau reload | DB rating=5; nội dung tồn tại sau reload | PASS |
| OLD-UI-07 | Validation và gửi khảo sát qua giao diện | Bài trống bị chặn; bài hợp lệ lưu 4 đáp án và hiển thị đã hoàn thành | Bài trống: chặn; DB answers=4; UI=Đã hoàn thành | PASS |
| OLD-UI-08 | Lỗi JavaScript và tài nguyên khi chạy E2E | Không có console error hoặc requestfailed | 0 console errors; 0 request failures | PASS |





| CRM01 | Customer gọi API quản trị | 403 | {"error": "Không có quyền truy cập"} | PASS |
| CRM02 | Không có phiên đăng nhập | 401 | {"error": "Chưa đăng nhập"} | PASS |
| CRM03 | JWT hết hạn | 401 | {"error": "Token không hợp lệ"} | PASS |
| CRM04 | Tạo tài khoản trùng email | 409; không có account mồ côi | 409; không có account mồ côi | PASS |
| CRM05 | Hai tài khoản bỏ trống email | 201 cả hai | 201 cả hai | PASS |
| CRM06 | Validation tài khoản | 400 cho tên trống, tuổi sai, trạng thái sai | 400 cho tên trống, tuổi sai, trạng thái sai | PASS |
| CRM07 | Khóa ID không tồn tại | 404 | {"error": "Khách hàng không tồn tại"} | PASS |
| CRM08 | Tìm ID hồ sơ khách hàng | đúng account/customer ID | đúng account/customer ID | PASS |
| CRM09 | Tạo đánh giá + đồng bộ Manager | 201; đúng dữ liệu DB/API | 201; đúng dữ liệu DB/API | PASS |
| CRM10 | Đọc/sửa đánh giá người khác | 404; dữ liệu nguyên vẹn | 404; dữ liệu nguyên vẹn | PASS |
| CRM11 | Sửa đánh giá + audit | 200; ghi nhận điểm cũ/mới | 200; ghi nhận điểm cũ/mới | PASS |
| CRM12 | Gửi và sửa phản hồi Manager | 200; có timestamp và 2 phiên bản | 200; có timestamp và 2 phiên bản | PASS |
| CRM13 | Retry phản hồi giống hệt | 200; không nhân đôi audit | 200; không nhân đôi audit | PASS |
| CRM14 | Sửa phản hồi từ bản cũ | 409; không ghi đè | 409; không ghi đè | PASS |
| CRM15 | Customer sửa sau phản hồi | 400 | {"error": "Đánh giá đã được nhân viên chăm sóc khách hàng trả lời, không thể chỉnh sửa."} | PASS |
| CRM16 | Manager tạo chiến dịch và đọc chi tiết | 201; đúng sản phẩm, câu hỏi, người nhận | 201; đúng sản phẩm, câu hỏi, người nhận | PASS |
| CRM17 | Ngày không tồn tại và cờ bắt buộc sai | 400 | 400 | PASS |
| CRM18 | Draft không hiển thị với Customer | không có trong list; detail 404 | không có trong list; detail 404 | PASS |
| CRM19 | Phát hành chiến dịch | 200; Customer được tham gia | 200; Customer được tham gia | PASS |
| CRM20 | Người không nhận khảo sát | 404 detail / 403 submit | 404 detail / 403 submit | PASS |
| CRM21 | Thiếu câu bắt buộc | 400; không lưu result | {"error": "Câu hỏi \"Bắt buộc\" là bắt buộc, vui lòng trả lời."} | PASS |
| CRM22 | Gửi khảo sát đồng thời hai lần | 201 + 409; 1 result, 1 answer | 201 + 409; 1 result, 1 answer | PASS |
| CRM23 | Lịch sử khảo sát trả đúng câu trả lời cá nhân | submission + đáp án 5 | submission + đáp án 5 | PASS |
| CRM24 | Sửa khảo sát đã có kết quả | 409; cấu trúc giữ nguyên | {"error": "Không thể chỉnh sửa cấu trúc khảo sát đã có câu trả lời. Bạn vẫn có thể đổi trạng thái trong form sửa khảo sát."} | PASS |
| CRM25 | Đóng khảo sát vẫn giữ lịch sử | 200; Customer đọc được kết quả cũ | 200; Customer đọc được kết quả cũ | PASS |
| CRM26 | Khóa tài khoản vô hiệu token đã cấp | 403 cho đọc/ghi; dữ liệu lịch sử nguyên vẹn | 403 cho đọc/ghi; dữ liệu lịch sử nguyên vẹn | PASS |
| CRM27 | Xóa khách có lịch sử | khóa; feedback/result không mất | khóa; feedback/result không mất | PASS |
| CRM28 | Ngừng sản phẩm giữ liên kết khảo sát | softDeleted; không mất liên kết | softDeleted; không mất liên kết | PASS |
| CRM29 | Thống kê sau khóa/ngừng kinh doanh | 1 result; 1 đánh giá 5 sao | KPI sản phẩm count=1, average=5; API kết quả 200 | PASS |
| CRM30 | Ngày/filter/page API kết hợp | 1 bản ghi đúng ID; tổng chính xác | 1 bản ghi đúng ID; tổng chính xác | PASS |
| CRM31 | Filter API không hợp lệ | 400 đảo ngày, ngày sai, page sai, sort sai | 400 đảo ngày, ngày sai, page sai, sort sai | PASS |
| CRM32 | Giá/trạng thái/nhà cung cấp không hợp lệ | 400, không tạo sản phẩm | 400, không tạo sản phẩm | PASS |
| CRM33 | Chỉnh sửa ID khách hàng | ID bất biến | ID bất biến | PASS |
| CRM34 | Khảo sát hết hạn lúc khách đang làm | 409; không lưu; vẫn có chi tiết hết hạn | 409; không lưu; vẫn có chi tiết hết hạn | PASS |
| CRM35 | Xóa sản phẩm chỉ có khảo sát, chưa feedback | ngừng kinh doanh; liên kết nguyên vẹn | ngừng kinh doanh; liên kết nguyên vẹn | PASS |
| CRM36 | Khách hàng đã xóa với token cũ | 401 | 401 | PASS |
| CRM37 | Optimistic concurrency tài khoản | 200 rồi 409; giữ thay đổi mới | 200 rồi 409; giữ thay đổi mới | PASS |
| CRM38 | CRUD sản phẩm chưa có quan hệ | thêm/sửa/đọc/xóa 201/200 | thêm/sửa/đọc/xóa 201/200 | PASS |
| CRM39 | CRUD nhà cung cấp chưa liên kết | thêm/sửa/tìm/xóa; chặn bản cũ | thêm/sửa/tìm/xóa; chặn bản cũ | PASS |
| CRM40 | Ngừng nhà cung cấp giữ sản phẩm và feedback | INACTIVE; sản phẩm UPCOMING; lịch sử giữ | INACTIVE; sản phẩm UPCOMING; lịch sử giữ | PASS |
| CRM41 | ID sai định dạng | 400 | 400 | PASS |
| CRM42 | Đổi email trùng không ghi dở dang | 409; họ tên không đổi | 409; họ tên không đổi | PASS |
| CRM43 | Khảo sát chưa phản hồi sửa/xóa và kiểm tra version | 200/409; không còn bản ghi sau xóa | 200/409; không còn bản ghi sau xóa | PASS |
| CRM44 | Hai Manager sửa cùng phản hồi | một 200, một 409; không mất audit | một 200, một 409; không mất audit | PASS |
| CRM45 | Xóa tài khoản chưa tương tác | xóa thật; không hồ sơ mồ côi | xóa thật; không hồ sơ mồ côi | PASS |
| CRM46 | Lọc sản phẩm ID và khoảng giá sai | ID trả đúng; khoảng giá 400 | ID trả đúng; khoảng giá 400 | PASS |
| CRM47 | Các cột sắp xếp sản phẩm đang dùng trên UI | 200 cho created_at/name/price/review_count/id | 200 cho created_at/name/price/review_count/id | PASS |
| CRM48 | Cập nhật profile một phần | giữ tên/email/tuổi khi không gửi trường tương ứng | giữ tên/email/tuổi khi không gửi trường tương ứng | PASS |
| CRM49 | Chặn xóa Admin hoạt động cuối khi còn Admin bị khóa | 400; hệ thống còn Admin ACTIVE | 400; hệ thống còn Admin ACTIVE | PASS |
| CRM50 | Lọc cùng ngày với SQL Server tại múi giờ địa phương | bao gồm đánh giá vừa tạo sau nửa đêm | bao gồm đánh giá vừa tạo sau nửa đêm | PASS |
| CRM51 | Đã hoàn thành vẫn đọc lịch sử nếu chiến dịch về DRAFT | Customer có kết quả được đọc; người khác không được | Customer có kết quả được đọc; người khác không được | PASS |
| CRM52 | Customer sửa cùng lúc Manager phản hồi | REPLIED nhất quán, audit đúng, không sửa sau phản hồi | REPLIED nhất quán, audit đúng, không sửa sau phản hồi | PASS |
| CRM53 | Hash bcrypt không thể dùng thay mật khẩu | mật khẩu gốc 200; chuỗi hash 401 | mật khẩu gốc 200; chuỗi hash 401 | PASS |
| CRM54 | Hồ sơ khách không còn hạng và điểm trung bình | API bỏ thuộc tính đã thống nhất; giữ metadata ngày tạo | API bỏ thuộc tính đã thống nhất; giữ metadata ngày tạo | PASS |
| CRM55 | Sản phẩm không còn tồn kho; vẫn có thống kê feedback | API bỏ stock_quantity; điểm sao sản phẩm đúng | API bỏ stock_quantity; điểm sao sản phẩm đúng | PASS |
| CRM56 | Payload tồn kho cũ không tác động nghiệp vụ | bỏ qua field cũ; tạo/sửa sản phẩm bình thường; sort tồn kho không còn hỗ trợ | bỏ qua field cũ; tạo/sửa sản phẩm bình thường; sort tồn kho không còn hỗ trợ | PASS |
| CRM57 | Khoảng ngày tính cả đầu ngày và toàn bộ cuối ngày | API danh sách và Dashboard cùng loại trước/sau, nhận 00:00 và 23:59:59.9999999 | API danh sách và Dashboard cùng loại trước/sau, nhận 00:00 và 23:59:59.9999999 | PASS |
| CRM58 | Lưu bộ mẫu đủ 4 loại câu hỏi | 201; giữ thứ tự, lựa chọn và bắt buộc trong DB/API | 201; giữ thứ tự, lựa chọn và bắt buộc trong DB/API | PASS |
| CRM59 | Validation bộ mẫu | 400 cho tên/câu hỏi trống, loại sai, lựa chọn thiếu, nội dung trùng; không lưu một phần | 400 cho tên/câu hỏi trống, loại sai, lựa chọn thiếu, nội dung trùng; không lưu một phần | PASS |
| CRM60 | Tên trùng và gửi đồng thời | 409 khi tên đã có; request đồng thời chỉ một bản ghi | 409 khi tên đã có; request đồng thời chỉ một bản ghi | PASS |
| CRM61 | Phân quyền và bộ mẫu riêng từng Manager | Customer 403; Manager khác không thấy mẫu; xóa tài khoản dọn mẫu riêng | Customer 403; Manager khác không thấy mẫu; xóa tài khoản dọn mẫu riêng | PASS |
| CRM62 | Dùng mẫu tạo chiến dịch là bản sao độc lập | sửa/xóa chiến dịch không làm đổi câu hỏi mẫu | sửa/xóa chiến dịch không làm đổi câu hỏi mẫu | PASS |
| CRM63 | Migration mẫu chạy lại an toàn; chi tiết feedback vẫn đúng chủ sở hữu | giữ mẫu hiện có; Customer khác 404; thông tin sản phẩm thuộc đánh giá chính mình | giữ mẫu hiện có; Customer khác 404; thông tin sản phẩm thuộc đánh giá chính mình | PASS |

| UX01 | Danh sách khách hàng | 6 cột, có ID, không tự mở form sửa | 6 cột, có ID, không tự mở form sửa | PASS |
| UX02 | Nút sửa không mở chi tiết | mở đúng form sửa | mở đúng form sửa | PASS |
| UX03 | Ẩn nút khóa ở danh sách khách hàng | khóa và mở khóa nằm trong form sửa | khóa và mở khóa nằm trong form sửa | PASS |
| UX04 | Điều hướng chi tiết bằng bàn phím | Enter mở chi tiết | Enter mở chi tiết | PASS |
| UX05 | Lọc ngày + sắp xếp + phân trang khách hàng | ngày đảo báo lỗi, reset phục hồi | ngày đảo báo lỗi, reset phục hồi | PASS |
| UX06 | Tìm khách hàng theo ID và xóa bộ lọc | đúng một bản ghi | đúng một bản ghi | PASS |
| UX07 | Feedback Manager danh sách/chi tiết | 7 cột; nội dung và phản hồi chỉ ở chi tiết | 7 cột; nội dung và phản hồi chỉ ở chi tiết | PASS |
| UX08 | Chiến dịch danh sách/chi tiết | 7 cột; không sản phẩm/mô tả ở bảng | 7 cột; không sản phẩm/mô tả ở bảng | PASS |
| UX09 | Chiến dịch lọc kết hợp | lọc ID + trạng thái + reset | lọc ID + trạng thái + reset | PASS |
| UX24 | Phản hồi tải chi tiết cũ không ghi đè bản ghi vừa mở | giữ đúng ID mới khi request cũ hoàn thành muộn | giữ đúng ID mới khi request cũ hoàn thành muộn | PASS |
| UX17 | Lỗi API phản hồi giữ nguyên dữ liệu nhập | hiện lỗi, không đóng form, giữ nội dung | hiện lỗi, không đóng form, giữ nội dung | PASS |
| UX18 | Manager gửi và sửa phản hồi qua UI | đã phản hồi; 2 phiên bản lịch sử | đã phản hồi; 2 phiên bản lịch sử | PASS |
| UX10 | Đánh giá Customer danh sách/popup | 6 cột; popup gọn, không ID/audit/lịch sử quản trị | 6 cột; popup gọn, không ID/audit/lịch sử quản trị | PASS |
| UX19 | Customer xem trả lời Manager mới nhất | hiện trả lời đã sửa; không có nút sửa đánh giá | hiện trả lời đã sửa; không có nút sửa đánh giá | PASS |
| UX11 | Customer xem khảo sát hoàn thành | xem lại câu trả lời, không nút nộp/sửa | xem lại câu trả lời, không nút nộp/sửa | PASS |
| UX12 | Customer list 375px | cuộn ngang trong bảng, trang không tràn viewport | cuộn ngang trong bảng, trang không tràn viewport | PASS |
| UX13 | CRUD admin-accounts danh sách/chi tiết | click hàng đọc, nút sửa mở form | click hàng đọc, nút sửa mở form | PASS |
| UX14 | CRUD manager-products danh sách/chi tiết | click hàng đọc, nút sửa mở form | click hàng đọc, nút sửa mở form | PASS |
| UX15 | CRUD manager-suppliers danh sách/chi tiết | click hàng đọc, nút sửa mở form | click hàng đọc, nút sửa mở form | PASS |
| UX20 | Manager sửa khách hàng giữ nhiều sở thích | giữ nguyên các lựa chọn khi chỉ đổi họ tên | giữ nguyên các lựa chọn khi chỉ đổi họ tên | PASS |
| UX21 | CRUD sản phẩm qua UI với dấu nháy | thêm → chi tiết → sửa → xóa đúng bản ghi | thêm → chi tiết → sửa → xóa đúng bản ghi | PASS |
| UX22 | CRUD nhà cung cấp qua UI | thêm → sửa liên hệ → xem chi tiết → xóa | thêm → sửa liên hệ → xem chi tiết → xóa | PASS |
| UX23 | CRUD tài khoản nội bộ và xem mật khẩu mới | tạo/sửa/khóa/xóa; mật khẩu dạng rõ vẫn xem được | tạo/sửa/khóa/xóa; mật khẩu dạng rõ vẫn xem được | PASS |
| UX25 | Customer xem sản phẩm theo mô hình feedback/khảo sát | không tồn kho; nhãn Đang bán/Ngừng bán; giữ điểm sao sản phẩm | không tồn kho; nhãn Đang bán/Ngừng bán; giữ điểm sao sản phẩm | PASS |
| UX26 | Ẩn ID tài khoản ở danh sách, chi tiết và sắp xếp | giữ tên đăng nhập và thao tác CRUD | giữ tên đăng nhập và thao tác CRUD | PASS |
| UX27 | Dashboard ngày dd/mm/yyyy và ẩn CSV | đổi sang ISO khi gọi API; chặn ngày sai; reset được cả hai ô | đổi sang ISO khi gọi API; chặn ngày sai; reset được cả hai ô | PASS |
| UX28 | Bỏ bộ lọc và nút đặt lại bị lặp | một bộ sắp xếp sản phẩm; một nút reset mỗi danh sách; không lặp bộ lọc sao | một bộ sắp xếp sản phẩm; một nút reset mỗi danh sách; không lặp bộ lọc sao | PASS |
| UX29 | Click và Enter ở bảng phân tích sản phẩm → feedback → chi tiết | không nút xem người đánh giá; mở đúng ID feedback và form trả lời | không nút xem người đánh giá; mở đúng ID feedback và form trả lời | PASS |
| UX30 | Click và Enter ở bảng phân tích khảo sát | không nút Chi tiết; mở kết quả đúng khảo sát | không nút Chi tiết; mở kết quả đúng khảo sát | PASS |
| UX31 | Sửa trạng thái khảo sát đã có câu trả lời | đóng trong form sửa; giữ nguyên câu hỏi, người nhận và số kết quả | đóng trong form sửa; giữ nguyên câu hỏi, người nhận và số kết quả | PASS |
| UX32 | Người nhận và đóng khảo sát chưa có kết quả nằm trong form sửa | lưu danh sách người nhận và trạng thái bằng form; không nút riêng ngoài bảng | lưu danh sách người nhận và trạng thái bằng form; không nút riêng ngoài bảng | PASS |
| UX33 | Cột thao tác khách hàng cố định và nút Sửa thẳng hàng | cùng tọa độ và chiều rộng; không nút khóa; giao diện dùng Feedback | cùng tọa độ và chiều rộng; không nút khóa; giao diện dùng Feedback | PASS |
| UX34 | Lưu bộ câu hỏi có tên và nạp lại ở phiên mới | giữ 4 loại, thứ tự, lựa chọn/bắt buộc; lưu không làm mất form | giữ 4 loại, thứ tự, lựa chọn/bắt buộc; lưu không làm mất form | PASS |
| UX35 | Lỗi lưu và hủy thay câu hỏi không mất bản đang soạn | hiện lỗi tại form, giữ tên/câu hỏi; chỉ thay khi xác nhận | hiện lỗi tại form, giữ tên/câu hỏi; chỉ thay khi xác nhận | PASS |
| UX36 | Ẩn email/số điện thoại trên người nhận cả tạo và sửa | giữ chọn khách, tên, tài khoản và thông tin phân nhóm | giữ chọn khách, tên, tài khoản và thông tin phân nhóm | PASS |
| UX37 | Popup Customer chỉ hiển thị đánh giá của mình và reply; dùng được ở 375px | không API quản trị/audit; không ID/lịch sử; reply mới và sản phẩm đúng | không API quản trị/audit; không ID/lịch sử; reply mới và sản phẩm đúng | PASS |
| UX16 | Lỗi JavaScript toàn bộ flow | 0 pageerror | 0 pageerror | PASS |

### Chưa chạy hoặc chờ quyết định

| Test Case | Thao tác | Kết quả mong đợi | Kết quả thực tế | Trạng thái |
|---|---|---|---|---|
| POLICY-PREFERENCES | Một hay nhiều sở thích ở đăng ký/thêm khách/hồ sơ | Chờ xác nhận | Đề xuất nhiều; chưa đổi giao diện lựa chọn hiện tại | BLOCKED |
| POLICY-DELETE-SURVEY | Xóa chiến dịch đã có kết quả theo quy tắc mới | Cần xác nhận chặn xóa hay cho xóa toàn bộ | Chưa đổi nghiệp vụ; API cũ vẫn xóa cả kết quả, confirmation nêu rõ; đã bọc transaction | BLOCKED |
| PROD-CRUD | Ghi/xóa trên database chính/production | Không thực hiện theo giới hạn người dùng | Không chạy, không triển khai | NOT RUN |
| PROD-RESTORE | Restore database thật | Không thực hiện | Không chạy; module backup/restore không bị sửa | NOT RUN |
| LOAD | Stress test dữ liệu lớn/hàng trăm client | Cần môi trường và ngưỡng tải | Đã thử request đồng thời có kiểm soát; chưa benchmark tải | NOT RUN |
| CROSS-TZ | Server/browser nhiều múi giờ | Cần chính sách timezone triển khai | Đã thử ngày qua nửa đêm ở UTC+7; chưa thử nhiều timezone | NOT RUN |

Các test cũ đã sửa selector/assertion để khớp thiết kế mới: bảng khách 6 cột, click mở detail, nội dung dài nằm ở detail, dùng bộ lọc người nhận thật và xử lý dữ liệu bcrypt cũ. Không sửa kỳ vọng để che lỗi nghiệp vụ.

## Báo cáo C – Vấn đề logic nghiệp vụ

| STT | Module | Vấn đề phát hiện | Mức độ | Đề xuất / xử lý |
|---|---|---|---|---|
| 1 | Survey | Xóa chiến dịch xóa cả kết quả | High | Đề xuất chặn xóa khi có kết quả, dùng Đóng; còn chờ lựa chọn. Chỉ thêm transaction cho hành vi xóa hiện có |
| 2 | Accounts | Mật khẩu rõ và trường password qua API quản trị | High | Người dùng chọn giữ chức năng xem; giữ tương thích, ghi nhận rủi ro còn tồn tại, không tuyên bố đã bảo mật mật khẩu toàn hệ thống |
| 3 | Auth | JWT cũ còn quyền sau khóa/xóa/đổi role | High | Đọc trạng thái và role hiện tại từ DB mỗi request; khóa 403, xóa 401 |
| 4 | Feedback | Sửa đồng thời phản hồi có thể sai audit/sửa sau REPLIED | High | Transaction, khóa trạng thái và version; test tranh chấp đối chiếu dữ liệu/audit |
| 5 | Reply | Ghi đè phản hồi không lịch sử | High | Cho sửa theo quyết định, lưu lịch sử; điều kiện nội dung cũ chống ghi đè; retry không nhân đôi |
| 6 | Survey | Validate trước transaction có thể dùng trạng thái/cấu trúc lỗi thời | High | Validate nộp trong transaction khóa survey; sửa cấu trúc/người nhận kiểm tra trong transaction; hết hạn trả 409 và không lưu |
| 7 | Customer Survey | Không đọc được lịch sử sau đóng/hết hạn | Medium | Luồng đọc có kiểm tra người nhận/chủ bài; trả answers/submitted_at; nộp vẫn bị khóa theo trạng thái/hạn |
| 8 | Product | Xóa mất liên kết ngữ cảnh khảo sát | High | Giữ liên kết, ngừng bán theo lựa chọn người dùng; test sản phẩm chỉ có survey, không feedback |
| 9 | Account | Email tùy chọn bị UNIQUE NULL chặn; duplicate trả 500 | Medium | Filtered unique index, 409 trùng email, rollback nhiều bảng |
| 10 | CRUD | Bỏ trường/mất đa sở thích khi sửa | High | Giữ trường chưa gửi, checkbox đa lựa chọn; API/UI kiểm tra đọc lại |
| 11 | Admin | Xóa Admin ACTIVE cuối khi còn Admin LOCKED | High | Bổ sung API/trigger; test 400 và còn Admin ACTIVE |
| 12 | List | ID số khớp nhầm tên/nội dung chứa chữ số đó | Medium | ID hoặc #ID khớp chính xác; tên/email tìm chuỗi; test kết hợp ngày/trạng thái/page |
| 13 | Date | Cắt UTC lệch ngày; chấp nhận 30/02 | Medium | Ngày địa phương hiển thị, kiểm lịch thực; test nửa đêm và ngày không tồn tại |
| 14 | Recipient filter | Sở thích rỗng khớp mọi bộ lọc | Medium | Bỏ phần tử rỗng, so sánh chính xác; UI kiểm tra dữ liệu hiển thị và bộ đếm |
| 15 | UI | Response/modal cũ ghi đè mới; chart callback mất canvas | Medium | Guard trang/modal/generation chart; hủy chart; test request detail bị giữ rồi trả muộn |
| 16 | Auth | Chuỗi bcrypt được so sánh trực tiếp như mật khẩu | High | Bcrypt chỉ dùng compare; test mật khẩu gốc 200 và chuỗi hash 401 |
| 17 | Hiệu năng | List vẫn nạp nhiều dữ liệu, chưa benchmark | Medium | Khi cần tải lớn, chuyển query lọc/sort/page xuống SQL và đo index; chưa đổi kiến trúc tự phát |
| 18 | Product status | Tên mã cũ không khớp cách sử dụng | Medium | Đã chốt nhãn Đang bán/Ngừng bán; giữ mã OFFICIAL/UPCOMING để tương thích API/DB |

## Báo cáo D – Đánh giá UI/UX

| Tiêu chí | Kết quả |
|---|---|
| Nhất quán | CRUD chính cùng bảng gọn → detail đọc → nút sửa riêng; giữ phong cách Hasaki |
| Danh sách | ID khách hàng/sản phẩm/chiến dịch/feedback; ẩn ID tài khoản; Feedback bỏ content/reply; Campaign bỏ sản phẩm/câu hỏi; hồ sơ và số liệu phụ ở detail |
| Chi tiết | Có thông tin chính/phụ, quan hệ, thời gian hiện có; Feedback có audit/reply history; Customer survey có câu trả lời đã nộp |
| Nút/click | Thêm góc phải header; thao tác cột phải; stopPropagation; hover và bàn phím; không nút Xem trùng click hàng |
| Hợp lệ theo trạng thái | REPLIED không cho Customer sửa; bài hoàn thành chỉ đọc; survey có response không mở sửa cấu trúc; khách có lịch sử dùng khóa |
| Tìm/lọc | Theo ID/tên và thuộc tính nghiệp vụ; ngày, sort, page 10 dòng; đổi lọc về trang đầu; lỗi khoảng ngày/không kết quả/reset |
| Di động | 375px không tràn trang; bảng cuộn ngang bên trong; giữ đủ cột quan trọng |
| Loading/lỗi | Gộp request ghi trùng, disable nút; lỗi giữ nội dung form; response cũ không đổi trang/modal mới |
| Trạng thái tham gia | Chưa tham gia / Đã hoàn thành / Đã đóng hoặc hết hạn; không tạo trạng thái nháp giả |
| Hạn chế | Trạng thái DB kết hợp ngày hoạt động; không tự đổi trạng thái bằng scheduler; chính sách xóa survey có kết quả còn chờ |

## Bằng chứng và chạy lại

- Kiểm thử thu gọn: [migration](tests/artifacts/lean-schema-results.json), [schema mới](tests/artifacts/fresh-schema-results.json).
- Ảnh bộ lọc: [Dashboard dd/mm/yyyy và chú thích](tests/artifacts/lean-dashboard-filters.png).
- Ảnh mới: [hồ sơ khách](tests/artifacts/lean-customer-detail.png), [sản phẩm Manager](tests/artifacts/lean-product-detail.png), [sản phẩm Customer](tests/artifacts/lean-customer-product.png).

- [Manifest](tests/artifacts/test-manifest.json), [API mở rộng](tests/artifacts/crm-api-results.json), [UI mở rộng](tests/artifacts/crm-ui-results.json), [kiểm tra DB](tests/artifacts/database-validation.txt).
- Ảnh: [Customers](tests/artifacts/crm-customers.png), [Campaigns](tests/artifacts/crm-campaigns.png), [Feedback detail](tests/artifacts/crm-feedback-detail.png), [Survey history](tests/artifacts/crm-survey-history.png), [Mobile](tests/artifacts/crm-surveys-mobile.png).
- Raw log trong tests/artifacts/*.log, được gitignore theo cấu hình cũ. JSON/ảnh/báo cáo giữ bằng chứng trong workspace.

Server test:

```powershell
$env:DB_SERVER='.\SQLEXPRESS'
$env:DB_DATABASE='CosmeticsCRM_Refactor_E2E_DB'
$env:CRM_TEST_MODE='1'
$env:PORT='3101'
npm start
```

Chạy kiểm thử ở cửa sổ khác:

```powershell
$env:DB_DATABASE='CosmeticsCRM_Refactor_E2E_DB'
$env:E2E_BASE_URL='http://localhost:3101'
npm run test:all
```

`npm test` chỉ chạy unit, không cần SQL Server. `npm run test:db:create` yêu cầu DB_DATABASE mới có hậu tố _E2E_DB và từ chối reset database đã tồn tại. E2E kiểm tra loopback và danh tính database server trước mọi thao tác ghi.

**Còn cần quyết định:** chặn xóa chiến dịch đã có kết quả hay giữ quyền xóa cả kết quả. Đề xuất chặn xóa và dùng Đóng để bảo toàn lịch sử. Chưa nhận lựa chọn nên chưa tuyên bố hoàn tất tiêu chí này.
