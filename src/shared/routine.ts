import type { CategoryData, Category, FaceOrBodyDay, HairDay } from "./types";

export const faceProducts: string[] = ["Tẩy trang Bioderma","Sữa rửa mặt Dermacos","Toner Cocoon Sen","Toner BHA / AHA","Tẩy da chết Civasan","Serum Centella / Cetaphil Cica / C22 / ANR","Azelaic acid Azecont","Niacinamide 15% Cocoon","Mặt nạ Wonjin / Histolab","Winter Melon Gel Cream"];

export const faceDays: FaceOrBodyDay[] = [
  {short:"T2",full:"Thứ Hai",focus:"BHA",
   am:[["Rửa mặt nhẹ bằng nước ấm","Không cần sữa rửa mặt nếu da không đổ dầu nhiều qua đêm"],["Toner Cocoon Sen",""],["Serum Niacinamide 15% — Cocoon","Hỗ trợ hàng rào da trước đêm BHA tối nay"],["Kem dưỡng Estee Lauder Revitalizing Supreme",""],["Kem chống nắng SPF 30–50 PA+++","Bắt buộc"]],
   pm:[["Tẩy trang Bioderma",""],["Sữa rửa mặt Dermacos",""],["Toner BHA Dermarium Tricky Duet 2%","Đêm active — tránh vùng mắt"],["Cetaphil Soothing and Comforting Cica Restoring Serum","Phục hồi & làm dịu sau BHA"],["Winter Melon Gel Cream","Thay cho kem đêm tối nay — kiềm dầu, thông thoáng sau BHA"]]},
  {short:"T3",full:"Thứ Ba",focus:"Azelaic Acid",
   am:[["Rửa mặt nhẹ bằng nước ấm",""],["Toner Cocoon Sen",""],["Serum Vitamin C — Cocoon Nghệ C22","Kết hợp tốt cùng Azelaic acid tối nay"],["Kem dưỡng Estee Lauder Revitalizing Supreme",""],["Kem chống nắng SPF 30–50 PA+++",""]],
   pm:[["Tẩy trang Bioderma",""],["Sữa rửa mặt Dermacos",""],["Toner Cocoon Sen","Không dùng acid khác đêm nay"],["Azelaic acid 15% — Azecont","Hỗ trợ mờ thâm, dịu mụn ẩn"],["Kem đêm Estee Lauder Revitalizing Supreme + Night",""]]},
  {short:"T4",full:"Thứ Tư",focus:"Tẩy da chết + Mặt nạ",
   am:[["Rửa mặt nhẹ bằng nước ấm",""],["Toner Cocoon Sen",""],["Serum Niacinamide 15% — Cocoon","Hỗ trợ hàng rào da trước đêm tẩy da chết"],["Kem dưỡng Estee Lauder Revitalizing Supreme",""],["Kem chống nắng SPF 30–50 PA+++",""]],
   pm:[["Tẩy trang Bioderma",""],["Sữa rửa mặt Dermacos",""],["Tẩy da chết Civasan 30g","Mát-xa nhẹ 1 phút, không chà mạnh, rồi rửa sạch"],["Toner Cocoon Sen",""],["Mặt nạ Wonjin phục hồi 8 CICA relaxing","Đắp 15–20 phút"],["Winter Melon Gel Cream","Thay cho kem đêm tối nay — kiềm dầu sau tẩy da chết, tránh bí da"]]},
  {short:"T5",full:"Thứ Năm",focus:"Đêm nghỉ",
   am:[["Rửa mặt nhẹ bằng nước ấm",""],["Toner Cocoon Sen",""],["Serum Vitamin C — Cocoon Nghệ C22","Đêm nay da nghỉ ngơi — tận dụng chống oxy hoá ban ngày"],["Kem dưỡng Estee Lauder Revitalizing Supreme",""],["Kem chống nắng SPF 30–50 PA+++",""]],
   pm:[["Tẩy trang Bioderma",""],["Sữa rửa mặt Dermacos",""],["Toner Cocoon Sen","Đêm nghỉ hoàn toàn"],["Serum Centella Skin1004",""],["Kem đêm Estee Lauder Revitalizing Supreme + Night",""]]},
  {short:"T6",full:"Thứ Sáu",focus:"AHA",
   am:[["Rửa mặt nhẹ bằng nước ấm",""],["Toner Cocoon Sen",""],["Serum Niacinamide 15% — Cocoon","Hỗ trợ hàng rào da trước đêm AHA — đêm active mạnh nhất tuần"],["Kem dưỡng Estee Lauder Revitalizing Supreme",""],["Kem chống nắng SPF 30–50 PA+++",""]],
   pm:[["Tẩy trang Bioderma",""],["Sữa rửa mặt Dermacos",""],["Toner AHA Dermarium Rough Addition 8%","Đêm active mạnh nhất tuần"],["Cetaphil Soothing and Comforting Cica Restoring Serum","Phục hồi & làm dịu sau AHA"],["Winter Melon Gel Cream","Thay cho kem đêm tối nay — kiềm dầu sau AHA, giữ da thông thoáng"]]},
  {short:"T7",full:"Thứ Bảy",focus:"Azelaic Acid",
   am:[["Rửa mặt nhẹ bằng nước ấm",""],["Toner Cocoon Sen",""],["Serum Vitamin C — Cocoon Nghệ C22","Kết hợp tốt cùng Azelaic acid tối nay"],["Kem dưỡng Estee Lauder Revitalizing Supreme",""],["Kem chống nắng SPF 30–50 PA+++",""]],
   pm:[["Tẩy trang Bioderma",""],["Sữa rửa mặt Dermacos",""],["Toner Cocoon Sen",""],["Azelaic acid 15% — Azecont",""],["Serum Estee Lauder Advanced Night Repair",""],["Kem đêm Estee Lauder Revitalizing Supreme + Night",""]]},
  {short:"CN",full:"Chủ Nhật",focus:"Mặt nạ luân phiên",
   am:[["Rửa mặt nhẹ bằng nước ấm",""],["Toner Cocoon Sen",""],["Serum Vitamin C — Cocoon Nghệ C22","Ngày mặt nạ nhẹ nhàng — bổ sung sáng da"],["Kem dưỡng Estee Lauder Revitalizing Supreme",""],["Kem chống nắng SPF 30–50 PA+++",""]],
   pm:[["Tẩy trang Bioderma",""],["Sữa rửa mặt Dermacos",""],["Toner Cocoon Sen",""],["Mặt nạ Histolab Peppermint","Mặt nạ tuần lẻ trong chu kỳ 4 tuần"],["Serum Centella Skin1004",""],["Winter Melon Gel Cream","Thay cho kem đêm tối nay — khép tuần nhẹ nhàng, không gây bí da"]]}
];

export const hairProducts: string[] = ["Tẩy da chết da đầu Cocoon bồ kết","Bơ ủ tóc Mielle","Dầu Mielle Rosemary Mint","Dầu hoa hồng ủ chân tóc","Dầu gội Loreal Serioxyl","Dầu xả Loreal Absolut Repair","Dầu xả Dove Derma Scalp","Serum Dove Hairfall","Tinh dầu bưởi Cocoon","Dầu dưỡng Kerastase Elixir"];

export const hairDays: HairDay[] = [
  {short:"T2",full:"Thứ Hai",type:"Ngày gội + tẩy da chết da đầu",
   steps:[["Tẩy da chết da đầu Cocoon bồ kết","Massage trước khi gội, để 5–10 phút rồi gội sạch"],["Dầu gội Loreal Serioxyl Advanced",""],["Dầu xả Loreal Absolut Repair Gold","Dưỡng thân & ngọn tóc"],["Serum Dove Hairfall recovery","Thoa từ chân đến ngọn sau khi lau khô bớt nước"],["Dầu dưỡng tóc Kerastase Elixir Ultime","Thoa nhẹ phần ngọn"]]},
  {short:"T3",full:"Thứ Ba",type:"Ngày nghỉ gội — dưỡng da đầu",
   steps:[["Dầu Mielle Rosemary Mint Scalp & Hair Oil","Massage da đầu, để thẩm thấu tự nhiên"],["Dầu dưỡng tóc Kerastase Elixir Ultime","Chỉ thoa nếu ngọn tóc khô"]]},
  {short:"T4",full:"Thứ Tư",type:"Ngày gội + ủ tóc chuyên sâu",
   steps:[["Dầu gội Loreal Serioxyl Advanced",""],["Bơ ủ tóc Mielle","Thoa từ giữa thân đến ngọn, ủ 15–20 phút rồi xả sạch"],["Dầu xả Dove Derma Scalp","Dưỡng da đầu"],["Serum Dove Hairfall recovery",""],["Dầu dưỡng tóc Kerastase Elixir Ultime",""]]},
  {short:"T5",full:"Thứ Năm",type:"Ngày nghỉ gội — kích thích mọc tóc",
   steps:[["Dầu hoa hồng ủ chân tóc","Massage chân tóc, để qua đêm nếu có thể"]]},
  {short:"T6",full:"Thứ Sáu",type:"Ngày gội",
   steps:[["Dầu gội Loreal Serioxyl Advanced",""],["Dầu xả Loreal Absolut Repair Gold",""],["Serum Dove Hairfall recovery",""],["Dầu dưỡng tóc Kerastase Elixir Ultime",""]]},
  {short:"T7",full:"Thứ Bảy",type:"Ngày nghỉ gội — dưỡng da đầu",
   steps:[["Tinh dầu bưởi Cocoon","Massage da đầu, để qua đêm, gội sạch sáng hôm sau nếu cần"]]},
  {short:"CN",full:"Chủ Nhật",type:"Ngày nghỉ hoàn toàn",
   steps:[["Để tóc nghỉ hoàn toàn",""],["Dầu dưỡng tóc Kerastase Elixir Ultime","Chỉ thoa nhẹ phần ngọn nếu cần"]]}
];

export const bodyProducts: string[] = ["Tẩy da chết cơ thể cà phê Cocoon","Dầu khô đa năng Nuxe Huile Multi","Kem dưỡng ẩm Vaseline Gluta Hya Night"];

export const bodyDays: FaceOrBodyDay[] = [
  {short:"T2",full:"Thứ Hai",focus:"Cấp ẩm hàng ngày",
   am:[["Dầu khô đa năng Nuxe Huile Multi","Thoa lên da còn ẩm ngay sau khi tắm"]],
   pm:[["Kem dưỡng ẩm Vaseline Gluta Hya Night","Thoa toàn thân trước khi ngủ"]]},
  {short:"T3",full:"Thứ Ba",focus:"Cấp ẩm hàng ngày",
   am:[["Dầu khô đa năng Nuxe Huile Multi","Thoa lên da còn ẩm ngay sau khi tắm"]],
   pm:[["Kem dưỡng ẩm Vaseline Gluta Hya Night",""]]},
  {short:"T4",full:"Thứ Tư",focus:"Ngày tẩy da chết",
   am:[["Tẩy da chết cơ thể cà phê Cocoon","Chà nhẹ nhàng trong lúc tắm, tập trung khuỷu tay, đầu gối, gót chân"],["Dầu khô đa năng Nuxe Huile Multi","Thoa ngay sau khi tắm"]],
   pm:[["Kem dưỡng ẩm Vaseline Gluta Hya Night",""]]},
  {short:"T5",full:"Thứ Năm",focus:"Cấp ẩm hàng ngày",
   am:[["Dầu khô đa năng Nuxe Huile Multi",""]],
   pm:[["Kem dưỡng ẩm Vaseline Gluta Hya Night",""]]},
  {short:"T6",full:"Thứ Sáu",focus:"Cấp ẩm hàng ngày",
   am:[["Dầu khô đa năng Nuxe Huile Multi",""]],
   pm:[["Kem dưỡng ẩm Vaseline Gluta Hya Night",""]]},
  {short:"T7",full:"Thứ Bảy",focus:"Cấp ẩm hàng ngày",
   am:[["Dầu khô đa năng Nuxe Huile Multi",""]],
   pm:[["Kem dưỡng ẩm Vaseline Gluta Hya Night",""]]},
  {short:"CN",full:"Chủ Nhật",focus:"Ngày tẩy da chết",
   am:[["Tẩy da chết cơ thể cà phê Cocoon","Chà nhẹ nhàng trong lúc tắm"],["Dầu khô đa năng Nuxe Huile Multi","Thoa ngay sau khi tắm"]],
   pm:[["Kem dưỡng ẩm Vaseline Gluta Hya Night",""]]}
];

export const routine: Record<Category, CategoryData> = {
  face: { products: faceProducts, days: faceDays },
  hair: { products: hairProducts, days: hairDays },
  body: { products: bodyProducts, days: bodyDays },
};
