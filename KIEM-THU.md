# Kết quả kiểm tra GIEO CLUB

- Đóng gói production bằng Vite: đạt.
- 14 kiểm thử tự động cho Apps Script và API: đạt.
- 40 lượt xác nhận độc lập cùng MSSV với Google Sheets mô phỏng: một dòng ghi, 39 phản hồi đã check-in. Các lệnh ghi và flush được kiểm tra phải giữ script lock.
- Gửi lại cùng mã yêu cầu: trả dòng đã có, không ghi thêm.
- Chuẩn hóa dấu nháy thẳng/cong, khoảng trắng ẩn, chữ số toàn chiều rộng, số 0 bị mất: đạt. Chuỗi sai độ dài không được đoán lại.
- MSSV có tên đăng ký xung đột, danh sách thay đổi sau tra cứu, token bị sửa, token hết hạn và khóa bận: xử lý đúng trong mô phỏng.
- Bộ giải mã production đọc vùng mã vạch của ảnh thẻ mẫu: đúng `030238220186`, Code 128, kể cả xoay 180° và lệch ±4°.
- Giao diện thử trên trình duyệt ở độ rộng 390 px và 320 px: không tràn ngang. Đã đi qua các trạng thái có đăng ký, nhập tên cho chưa đăng ký, xác nhận thành công và đã check-in.
- Mô phỏng mất phản hồi sau ghi: giao diện giữ họ tên/MSSV/mã yêu cầu và phục hồi lượt đang gửi sau tải lại trang.
- Đã tạo và đọc lại tab thật `Check-in GIEO`: đúng 5 tiêu đề, cột MSSV dạng văn bản, hàng tiêu đề cố định.

**Chưa thực hiện:** triển khai Apps Script trong tài khoản Google của bạn, triển khai Vercel, đồng bộ check-in thật, đo tải Google với nhiều điện thoại thật và kiểm tra camera trực tiếp trên iPhone/Android. Các kiểm thử tự động dùng dịch vụ mô phỏng; không thay thế kiểm tra sau triển khai. Không có lượt sinh viên thử nào được ghi vào file Google Sheets thật.
