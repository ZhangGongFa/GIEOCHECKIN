# Thêm Apps Script cho GIEO CLUB

Tab **Check-in GIEO** đã được tạo sẵn trong [file Google Sheets của bạn](https://docs.google.com/spreadsheets/d/1trguxqawK5ARHGiEItfexpKiQRsxN5q_s9p1spJEj0E/edit). Các bước dưới kết nối web với file đó.

## A. Dán mã và chuẩn bị tab

1. Mở Google Sheets bằng tài khoản có quyền sửa file.
2. Chọn **Tiện ích mở rộng → Apps Script**.
3. Đặt tên dự án **GIEO Check-in**.
4. Mở file **Code.gs** trong editor, thay nội dung bằng toàn bộ mã trong `apps-script/Code.gs` đi kèm bộ mã. Bấm **Lưu**.
5. Vào **Cài đặt dự án / Project Settings → Thuộc tính tập lệnh / Script Properties → Thêm thuộc tính**:

   - Tên: **`GIEO_API_SECRET`**.
   - Giá trị: một chuỗi bí mật ngẫu nhiên dài ít nhất **32 ký tự**. Bạn tự tạo và giữ riêng; sẽ dùng lại ở Vercel.

   Nếu có Node.js, mở Terminal và chạy để tạo chuỗi:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

6. Trong Project Settings, đặt múi giờ **GMT+07:00 / Asia/Ho_Chi_Minh**.
7. Quay lại **Trình chỉnh sửa / Editor**. Chọn hàm **`setupCheckin`** ở thanh công cụ → **Chạy / Run**. Cấp quyền Google cho script do bạn vừa tạo để script có thể truy cập và chỉnh sửa spreadsheet. Khi nhật ký báo đã chuẩn bị tab là xong bước này.

## B. Lấy URL triển khai

1. Chọn **Triển khai / Deploy → Lần triển khai mới / New deployment**.
2. Chọn biểu tượng bánh răng → **Ứng dụng web / Web app**.
3. Đặt:

   | Mục | Chọn |
   | --- | --- |
   | Thực thi với tư cách / Execute as | **Tôi / Me** |
   | Ai có quyền truy cập / Who has access | **Bất kỳ ai / Anyone** |

4. Bấm **Triển khai / Deploy**, hoàn tất yêu cầu cấp quyền nếu có.
5. Sao chép **URL ứng dụng web / Web app URL**. URL đúng có dạng:

   ```text
   https://script.google.com/macros/s/…/exec
   ```

**Không dùng** Script ID, URL editor hoặc URL kết thúc bằng `/dev`. Nếu tài khoản trường không có tùy chọn Anyone, cần dùng tài khoản được phép triển khai và có quyền sửa file, hoặc liên hệ quản trị viên.

## C. Điền 3 biến ở Vercel

Trong dự án Vercel, vào **Settings → Environment Variables**:

| Tên biến | Giá trị |
| --- | --- |
| `APPS_SCRIPT_URL` | URL `/exec` vừa sao chép |
| `APPS_SCRIPT_SECRET` | Chính xác giá trị bạn đã đặt cho `GIEO_API_SECRET` |
| `CHECKIN_ACCESS_CODE` | Mã riêng cho người quét thẻ, ít nhất 8 ký tự |

Chọn môi trường **Production**; thêm **Preview** nếu muốn kiểm tra các bản preview. Lưu, sau đó **Redeploy** dự án Vercel. Không thêm tiền tố `VITE_` vào tên biến.

Mở web Vercel trên điện thoại → nhập mã ban tổ chức → chờ dòng **Đã kết nối Google Sheets** → bắt đầu quét. Hai chuỗi bí mật của Apps Script/Vercel phải trùng nhau. Người quét chỉ cần mã `CHECKIN_ACCESS_CODE`.

## D. Thử trước chương trình

- Quét thẻ thật của một sinh viên đã đăng ký, đối chiếu tên và bấm OK. Kiểm tra một dòng mới trong tab **Check-in GIEO**, cột A là họ tên và B là MSSV có số 0 đầu.
- Thử sinh viên chưa đăng ký để kiểm tra mục nhập họ tên.
- Dùng hai điện thoại xác nhận cùng MSSV: chỉ một dòng được ghi.
- Tất cả các điện thoại dùng cùng URL web và cùng **một Apps Script project** cho tab này.

Khi sửa Apps Script sau này: **Lưu → Deploy → Manage deployments → Edit → New version → Deploy**. Xem [hướng dẫn đầy đủ](README.md) để đưa mã lên GitHub/Vercel và xử lý lỗi.

Tham khảo: [hướng dẫn triển khai Web Apps chính thức của Google](https://developers.google.com/apps-script/guides/web).
