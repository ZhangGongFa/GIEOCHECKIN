# GIEO CLUB · Check-in

Ứng dụng HTML, CSS và JavaScript tối ưu cho điện thoại. Quét mã vạch thẻ sinh viên, tra cứu họ tên, xác nhận bằng nút OK rồi ghi vào Google Sheets. Có nhập MSSV thủ công và nhập họ tên khi sinh viên chưa đăng ký.

**Trạng thái bàn giao:** mã nguồn đã hoàn thiện; tab `Check-in GIEO` đã được tạo trong file của bạn. Apps Script và Vercel chưa triển khai vì phiên trình duyệt không đăng nhập tài khoản Google của bạn. Cần làm phần 1 và 2 bên dưới để đồng bộ thật. Chế độ `?demo=1` chỉ thử giao diện, không ghi vào Sheet.

## 1. Thiết lập Google Apps Script — khoảng 5–10 phút

1. Mở [Google Sheet đã cung cấp](https://docs.google.com/spreadsheets/d/1trguxqawK5ARHGiEItfexpKiQRsxN5q_s9p1spJEj0E/edit). Dùng tài khoản có quyền **chỉnh sửa** file.
2. Chọn **Tiện ích mở rộng / Extensions → Apps Script**. Đặt tên dự án là `GIEO Check-in`.
3. Trong `Code.gs`, dán toàn bộ nội dung file `apps-script/Code.gs` của bộ mã này rồi lưu.
4. Mở **Project Settings / Cài đặt dự án → Script Properties / Thuộc tính tập lệnh → Add script property**. Thêm:

   | Property | Value |
   | --- | --- |
   | `GIEO_API_SECRET` | Chuỗi bí mật ngẫu nhiên dài ít nhất 32 ký tự; dùng cùng giá trị ở Vercel |

   Có thể tạo chuỗi bí mật trên máy đã cài Node.js bằng lệnh dưới. Giữ chuỗi này riêng, không đưa vào GitHub, không gửi cho các bạn quét thẻ.

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

5. Trong Project Settings, chọn múi giờ **GMT+07:00 / Asia/Ho_Chi_Minh**. Nếu muốn dùng file manifest: bật **Show appsscript.json manifest file in editor**, sau đó thay nội dung bằng `apps-script/appsscript.json`.
6. Quay lại Editor, chọn hàm **`setupCheckin`** trên thanh công cụ, bấm **Run / Chạy**, rồi cấp quyền Google khi được hỏi. Hàm này kiểm tra file và chuẩn bị tab check-in. Nếu tab đã tồn tại đúng cấu trúc thì giữ dữ liệu của tab đó.
7. Chọn **Deploy / Triển khai → New deployment / Triển khai mới**. Chọn loại **Web app / Ứng dụng web**:

   | Cài đặt | Giá trị |
   | --- | --- |
   | Execute as / Thực thi với tư cách | **Me / Tôi** |
   | Who has access / Ai có quyền truy cập | **Anyone / Bất kỳ ai** |

   Endpoint có kiểm tra chuỗi bí mật từ Vercel trước khi đọc hoặc ghi dữ liệu. Nếu tài khoản trường không cho chọn `Anyone`, cần dùng tài khoản được phép triển khai và có quyền sửa Sheet, hoặc nhờ quản trị viên cho phép.

8. Bấm Deploy, hoàn tất cấp quyền do Google yêu cầu. Sao chép **Web app URL** kết thúc bằng **`/exec`**. Không dùng URL `/dev`, URL trang editor hoặc Script ID.

**Khi sửa `Code.gs`:** lưu mã rồi vào **Deploy → Manage deployments → Edit → Version: New version → Deploy**. Giữ nguyên deployment URL nếu cập nhật deployment cũ.

## 2. Đưa lên GitHub và Vercel

1. Giải nén bộ mã. Tạo repository GitHub và đưa **nội dung bên trong thư mục `gieo-checkin`** lên repository: `index.html`, `package.json`, `package-lock.json`, `src`, `public`, `api`, `scripts`, `apps-script`, `tests`, `vercel.json` và các file hướng dẫn. Không đưa `node_modules`, `.env.local` hoặc `dist` lên GitHub.
2. Trên Vercel, chọn **Add New → Project**, import repository GitHub đó.
3. Chọn **Framework Preset: Vite**. Kiểm tra:

   | Mục | Giá trị |
   | --- | --- |
   | Root Directory | Thư mục chứa `package.json`; để trống nếu repo chứa mã ở gốc |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Install Command | `npm ci` |
   | Node.js | 22.12+ hoặc 24 |

4. Thêm **Environment Variables** trước khi deploy:

   | Tên | Giá trị |
   | --- | --- |
   | `APPS_SCRIPT_URL` | Web app URL `/exec` ở bước trên |
   | `APPS_SCRIPT_SECRET` | Đúng chuỗi đã đặt ở `GIEO_API_SECRET` |
   | `CHECKIN_ACCESS_CODE` | Mã truy cập dành cho ban tổ chức, ít nhất 8 ký tự |

   Không thêm tiền tố `VITE_` cho các biến này. Các biến được đọc ở máy chủ, không đóng gói vào mã trình duyệt.

5. Bấm **Deploy**. Nếu thêm/sửa biến môi trường sau đó, cần **Redeploy** để áp dụng.
6. Mở URL HTTPS Vercel trên điện thoại. Nhập `CHECKIN_ACCESS_CODE`, bấm Vào. Khi thấy **Đã kết nối Google Sheets**, có thể bắt đầu quét.

Bạn gửi **URL Vercel và mã truy cập dành cho ban tổ chức** cho những người quét thẻ. Mỗi bạn dùng điện thoại của mình. Chỉ một Apps Script project phụ trách tab check-in này.

## 3. Quy trình sử dụng

1. Bấm **Bật camera để quét**, cho phép camera. Dùng camera sau, đưa phần mã vạch vào khung, giữ thẻ ổn định và tránh ánh sáng phản chiếu. Trình quét cần nhận cùng MSSV hai lần liên tiếp trước khi tra cứu.
2. Có tên trong danh sách: hiển thị họ tên để đối chiếu với sinh viên.
3. Không có trong danh sách: hỏi và nhập họ tên. Giao diện phân biệt rõ **Chưa đăng ký**.
4. Bấm **OK · Xác nhận check-in**. Chỉ khi Google Sheets xác nhận, giao diện mới báo **Check-in thành công / Đã đồng bộ**.
5. Nếu MSSV đã có trong tab check-in, báo **Bạn này đã check-in** và không thêm dòng mới.
6. Nếu mạng chậm/lỗi, giữ màn hình và bấm **Gửi lại · Kiểm tra đồng bộ**. Lượt đang gửi được lưu trên thiết bị; tải lại trang vẫn có thể tiếp tục. Không cần nhập lại một lượt mới. Phiên xác nhận quá hạn sẽ yêu cầu tra cứu và xác nhận lại.

Camera cần HTTPS và quyền camera. Dùng Safari trên iPhone hoặc Chrome trên Android; nếu mở trong trình duyệt của Zalo/Facebook và camera không hoạt động, mở bằng Safari/Chrome. Có mục **nhập thủ công** khi thẻ bị mờ hoặc phản chiếu. Danh sách “Vừa check-in” chỉ hiển thị tối đa 8 lượt đã xác nhận trên thiết bị/phiên này, không phải tổng số của chương trình.

## 4. Cấu trúc Google Sheets

File đã cấu hình: `1trguxqawK5ARHGiEItfexpKiQRsxN5q_s9p1spJEj0E`.

- Tab đăng ký: **Câu trả lời biểu mẫu 1**.
- Họ tên: **cột B**, dữ liệu từ hàng 2.
- MSSV: **cột D**.
- Tab nhận check-in: **Check-in GIEO**.

| Cột check-in | Nội dung |
| --- | --- |
| A | Họ và tên |
| B | MSSV — lưu dạng văn bản để giữ số 0 đầu |
| C | Thời gian check-in, dùng múi giờ của spreadsheet |
| D | Đăng ký trước: Có / Không |
| E | Mã yêu cầu để đối soát lượt gửi lại |

Không thay đổi tên/tiêu đề các cột check-in khi đang chạy. Dữ liệu đăng ký không bị sửa. Nếu thay Sheet hoặc sự kiện, chỉnh đối tượng `CONFIG` đầu `Code.gs` rồi triển khai phiên bản mới. Mỗi chương trình dùng tab check-in riêng; chống trùng áp dụng theo tab đang cấu hình.

## 5. Chuẩn hóa MSSV và chống trùng

MSSV từ camera/API phải có **đúng 12 chữ số và bắt đầu bằng 0**. Không dùng kiểu số, không tự sửa chuỗi quét sai độ dài.

Khi đọc cột D, Apps Script bỏ dấu nháy thẳng/cong, dấu nháy tương tự, khoảng trắng và ký tự khoảng trắng ẩn; chuẩn hóa chữ số toàn chiều rộng. Nếu ô là số hoặc chuỗi số 11 chữ số do mất số 0 đầu, khôi phục **một** số 0. Dạng hiển thị khoa học được đối chiếu thêm với giá trị gốc của ô. Chuỗi sai độ dài, chứa chữ hoặc mất nhiều chữ số không được đoán lại.

Nếu cùng MSSV có nhiều họ tên khác nhau trong danh sách đăng ký, ứng dụng báo để ban tổ chức sửa dữ liệu; không tự chọn một tên. Trùng dòng đăng ký nhưng cùng tên (khác hoa/thường/khoảng trắng) vẫn được tra cứu.

Mỗi lượt ghi dùng `LockService.getScriptLock()`: **giữ khóa → đọc lại danh sách check-in → kiểm tra MSSV → ghi một dòng → flush → nhả khóa**. Không dựa vào trạng thái trùng trên từng điện thoại hoặc cache. Lượt gửi lại giữ nguyên mã yêu cầu; nếu dòng đã được ghi thì trả dòng đó, không ghi thêm. Họ tên sinh viên đã đăng ký được xác minh lại trên máy chủ; nếu danh sách đăng ký đổi sau tra cứu thì yêu cầu xác nhận lại.

Điều kiện để cơ chế này có hiệu lực: tất cả điện thoại dùng cùng ứng dụng và cùng **một Apps Script project** cho tab này; không dùng script khác hoặc ghi tay đồng thời vào tab check-in. Google Sheets không cung cấp ràng buộc duy nhất như cơ sở dữ liệu. Apps Script và Vercel có quota; khi quá tải ứng dụng giữ lượt để gửi lại thay vì báo thành công sai. Cần thử trên các điện thoại và số trạm thực tế trước chương trình.

## 6. Chạy trên máy và thử giao diện

Cài Node.js 22.12+ hoặc 24, mở Terminal trong thư mục mã:

```sh
npm ci
npm run dev
```

- Bản thật trên máy: `http://localhost:5173`. Sao chép `.env.example` thành `.env.local` và điền các biến để đồng bộ thật.
- Bản thử giao diện: `http://localhost:5173/?demo=1`. MSSV thử có đăng ký: **030000000001**; MSSV khác đúng định dạng sẽ vào nhánh chưa đăng ký. Không ghi Google Sheets.
- Sau deploy cũng có thể thêm `?demo=1` vào URL để thử. Chế độ thử hiển thị rõ trên giao diện.
- Không mở `index.html` bằng `file://`; dùng server vì ứng dụng có module JavaScript và API.

```sh
npm test
npm run build
```

Kiểm thử tự động sử dụng Google Sheets/Apps Script mô phỏng, không ghi dữ liệu thử vào file thật. Phạm vi: chuẩn hóa MSSV, 40 xác nhận độc lập cùng MSSV, lượt gửi lại, khóa bận, thay đổi đăng ký, tên xung đột, chống sửa thông tin xác nhận, định dạng cột và API. Đây không phải kiểm thử tải trên hạ tầng Google thực tế.

## 7. Kiểm tra sau triển khai

1. Dùng MSSV thực đã đăng ký: kiểm tra đúng tên, bấm OK và xem đúng một dòng trong tab check-in.
2. Dùng một sinh viên chưa đăng ký: nhập tên và kiểm tra họ tên/MSSV lên đúng hai cột A/B.
3. Mở hai điện thoại, tra cứu cùng MSSV chưa check-in, rồi bấm OK gần như cùng lúc: chỉ một dòng xuất hiện; điện thoại kia báo đã check-in.
4. Thử gửi lại cùng MSSV: không có dòng mới. Xác nhận số 0 đầu còn nguyên.
5. Thử mất mạng và phục hồi. Nếu chưa có phản hồi, không coi là đã xong; gửi lại và đối chiếu Sheet.

## 8. Khắc phục nhanh

| Hiện tượng | Cách xử lý |
| --- | --- |
| Chưa kết nối Google Sheets | Kiểm tra đủ 3 biến Vercel và Redeploy |
| Apps Script chưa trả JSON | Dùng đúng URL `/exec`, deployment Web app và `Anyone` |
| Không có quyền truy cập | `APPS_SCRIPT_SECRET` phải trùng `GIEO_API_SECRET` |
| Chạy setupCheckin trước | Chạy hàm `setupCheckin` trong editor, cấp quyền Google |
| Không tìm thấy tab đăng ký | Tên tab phải trùng `CONFIG.registrationSheet` |
| Mã truy cập chưa đúng | Dùng đúng `CHECKIN_ACCESS_CODE` của ban tổ chức |
| Có nhiều lượt check-in | Giữ màn hình, bấm gửi lại; kiểm tra quota Apps Script nếu kéo dài |
| MSSV trùng nhiều họ tên | Sửa các dòng đăng ký tương ứng ở cột B/D rồi tra cứu lại |

## Tài liệu kỹ thuật chính thức

- [Google Apps Script Web Apps](https://developers.google.com/apps-script/guides/web)
- [Google Apps Script LockService](https://developers.google.com/apps-script/reference/lock/lock-service)
- [Google ContentService và redirect](https://developers.google.com/apps-script/guides/content)
- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [ZXing WebAssembly](https://github.com/Sec-ant/zxing-wasm)
