import Gallery from "./Gallery";
import DayTabs from "./DayTabs";
import DayPanel from "./DayPanel";
import { routine } from "../shared/routine";
import type { Category } from "../shared/types";

const THEME_CLASS: Record<Category, string> = {
  face: "",
  hair: "theme-yellow",
  body: "theme-almond",
};

function Petals({ opacity = 0.35 }: { opacity?: number }) {
  return (
    <svg className="petals" width="140" height="140" viewBox="0 0 140 140" fill="none">
      <g fill="currentColor" opacity={opacity}>
        <ellipse cx="70" cy="40" rx="26" ry="16" transform="rotate(20 70 40)" />
        <ellipse cx="95" cy="60" rx="26" ry="16" transform="rotate(80 95 60)" />
        <ellipse cx="60" cy="70" rx="26" ry="16" transform="rotate(140 60 70)" />
      </g>
      <circle cx="78" cy="55" r="10" fill="var(--gold)" />
    </svg>
  );
}

function FaceHero() {
  return (
    <header className="hero">
      <Petals />
      <p className="eyebrow">Chăm sóc da mặt</p>
      <h1 className="cat-title">
        Routine dịu dàng
        <br />
        mỗi sáng &amp; tối
      </h1>
      <p className="desc">
        Vòng lặp 7 ngày để các loại acid (BHA, AHA, Azelaic), tẩy da chết vật lý buổi tối và
        Niacinamide / Vitamin C buổi sáng không chồng lên nhau.
      </p>
      <div className="legend">
        <span>
          <span className="dot" style={{ background: "var(--rose)" }}></span> Da khoẻ / phục hồi
        </span>
        <span>
          <span className="dot" style={{ background: "var(--gold)" }}></span> Đêm có active mạnh
        </span>
        <span>
          <span className="dot" style={{ background: "var(--blush-deep)" }}></span> Đêm nghỉ / cấp
          ẩm
        </span>
      </div>
    </header>
  );
}

function HairHero() {
  return (
    <header className="hero">
      <Petals opacity={0.3} />
      <p className="eyebrow">Chăm sóc tóc &amp; da đầu</p>
      <h1 className="cat-title">
        Tóc chắc khoẻ,
        <br />
        da đầu dịu nhẹ
      </h1>
      <p className="desc">
        Gội 3 lần/tuần, xen kẽ dưỡng da đầu vào những ngày nghỉ gội — để tẩy tế bào chết, ủ tóc và
        dầu dưỡng không dồn vào cùng một ngày.
      </p>
      <div className="legend">
        <span>
          <span className="dot" style={{ background: "var(--rose)" }}></span> Ngày gội đầu
        </span>
        <span>
          <span className="dot" style={{ background: "var(--gold)" }}></span> Ủ tóc / tẩy da chết
        </span>
        <span>
          <span className="dot" style={{ background: "var(--blush-deep)" }}></span> Ngày nghỉ gội
        </span>
      </div>
    </header>
  );
}

function BodyHero() {
  return (
    <header className="hero">
      <Petals opacity={0.3} />
      <p className="eyebrow">Chăm sóc da cơ thể</p>
      <h1 className="cat-title">
        Mềm mịn mỗi ngày,
        <br />
        nhẹ nhàng mỗi bước
      </h1>
      <p className="desc">
        Routine ngắn gọn, dễ duy trì hàng ngày — chỉ thêm bước tẩy da chết 2 lần/tuần để da luôn
        mềm mịn mà không khô căng.
      </p>
      <div className="legend">
        <span>
          <span className="dot" style={{ background: "var(--rose)" }}></span> Cấp ẩm hàng ngày
        </span>
        <span>
          <span className="dot" style={{ background: "var(--gold)" }}></span> Ngày tẩy da chết
        </span>
      </div>
    </header>
  );
}

function FaceExtras() {
  return (
    <>
      <div className="note-box">
        <strong>Nguyên tắc buổi sáng ☀️</strong> — mỗi sáng chỉ dùng <em>một</em> serum active
        (Niacinamide 15% hoặc Vitamin C), không dùng chung để tránh chồng active ngay từ đầu ngày.{" "}
        <strong>Niacinamide 15%</strong> dùng vào Thứ 2, Thứ 4, Thứ 6 — đúng những sáng trước các
        đêm có exfoliation mạnh nhất (BHA, tẩy da chết vật lý, AHA), giúp củng cố hàng rào bảo vệ
        da trước khi da &quot;làm việc&quot; vào buổi tối. <strong>Vitamin C</strong> dùng vào Thứ
        3, Thứ 5, Thứ 7, Chủ Nhật — đúng những ngày có Azelaic acid dịu nhẹ hoặc đêm nghỉ/mặt nạ,
        tận dụng thêm khả năng chống oxy hoá &amp; sáng da khi da không bị tác động mạnh cùng lúc.
        Nhờ vậy cả tuần vẫn có đủ dưỡng chất mờ thâm — sáng da mà không có buổi sáng nào bị
        &quot;chồng&quot; 2 active cùng lúc.
        <br />
        <br />
        <strong>🆕 Giai đoạn làm quen (Tuần 1–2):</strong> chỉ dùng Niacinamide vào Thứ 2 và Thứ 6,
        riêng Thứ 4 vẫn giữ Vitamin C như cũ — vì nồng độ 15% khá cao, da có thể hơi châm/ửng nhẹ
        vài ngày đầu nếu chưa quen. Nếu da không phản ứng gì sau 2 tuần, <strong>từ Tuần 3 trở đi</strong>{" "}
        chuyển hẳn sang lịch chính thức (Niacinamide đủ 3 buổi T2 · T4 · T6) như bảng bên dưới đã
        ghi.
      </div>

      <div className="note-box">
        <strong>Nguyên tắc xuyên suốt 🌸</strong> — mỗi tối chỉ dùng <em>một</em> loại active mạnh
        (BHA, AHA, Azelaic hoặc tẩy da chết vật lý Civasan), không cộng dồn. Bước dưỡng cuối cùng
        mỗi tối <strong>luân phiên giữa Winter Melon Gel Cream và kem đêm Estee Lauder
        Revitalizing Supreme</strong>: gel cream dùng vào các đêm có active mạnh hoặc tẩy da chết
        (T2 BHA, T4 Civasan, T6 AHA, CN cuối tuần) vì kết cấu nhẹ, kiềm dầu, giúp da thông thoáng
        hơn — phù hợp da hỗn hợp thiên dầu hơn kem đặc; kem EL dùng vào các đêm nhẹ nhàng hơn (T3,
        T5, T7) để dưỡng sâu và chống lão hoá. Bước phục hồi trước đó cũng{" "}
        <strong>luân phiên giữa Cetaphil Cica Restoring Serum và Serum Centella Skin1004</strong>:
        Cetaphil dùng vào 2 đêm active mạnh nhất tuần (T2 BHA, T6 AHA) để hỗ trợ làm dịu & phục hồi
        tốt hơn; Centella vẫn giữ ở các đêm nhẹ (T5, CN). Vì da đang đáp ứng tốt, Civasan vẫn giữ
        nguyên trong routine như trước.
      </div>

      <h2 className="section-title">Đề xuất bổ sung</h2>
      <p
        style={{
          fontSize: "14px",
          color: "#7d6266",
          maxWidth: "70ch",
          marginBottom: "18px",
          lineHeight: 1.65,
        }}
      >
        Với mục tiêu mờ thâm, giảm mụn ẩn, sáng và mịn da nhanh, đây là những gì đáng cân nhắc
        thêm.
      </p>
      <div className="grid2">
        <div className="reco warn">
          <span className="tag">Bắt buộc</span>
          <h3>Kem chống nắng SPF 30–50, PA+++</h3>
          <p>
            Thứ thiếu quan trọng nhất — da đang dùng AHA, BHA, Azelaic và Vitamin C cùng lúc nên
            rất nhạy cảm với nắng, dễ tăng sắc tố nếu không chống nắng đều.
          </p>
        </div>
        <div className="reco">
          <span className="tag">Đã có ✓</span>
          <h3>Niacinamide 15% — Cocoon</h3>
          <p>
            Đã đưa vào routine buổi sáng, xen kẽ với Vitamin C (T2/T4/T6 Niacinamide, T3/T5/T7/CN
            Vitamin C) — hỗ trợ hàng rào da, kiểm soát dầu và đều màu da mà không chồng active
            cùng lúc.
          </p>
        </div>
        <div className="reco">
          <span className="tag">Đã có ✓</span>
          <h3>Winter Melon Gel Cream</h3>
          <p>
            Thay cho Cicaplast Baume B5 ở bước dưỡng cuối các đêm active/tẩy da chết (T2, T4, T6,
            CN) — kết cấu gel nhẹ, kiềm dầu, phù hợp da hỗn hợp thiên dầu hơn, tránh bí da.
          </p>
        </div>
        <div className="reco">
          <span className="tag">Đã có ✓</span>
          <h3>Cetaphil Cica Restoring Serum</h3>
          <p>
            Luân phiên với Centella Skin1004 ở bước phục hồi: dùng vào 2 đêm active mạnh nhất tuần
            (T2 BHA, T6 AHA) để hỗ trợ làm dịu & phục hồi tốt hơn; Centella vẫn giữ ở các đêm nhẹ
            (T5, CN).
          </p>
        </div>
        <div className="reco warn">
          <span className="tag">Cân nhắc kỹ</span>
          <h3>Retinol / Retinal / Tretinoin</h3>
          <p>Xem giải thích chi tiết bên dưới trước khi thêm — routine hiện tại đã khá nhiều active.</p>
        </div>
        <div className="reco warn">
          <span className="tag">Lưu ý ngay</span>
          <h3>Da đang hơi khô/bong nhẹ</h3>
          <p>
            Nếu vùng nào vẫn căng/khô sau khi đổi sang Winter Melon Gel Cream, chấm thêm một lớp
            Cetaphil Cica Restoring Serum tại đúng vùng đó trước bước gel cream (không cần cả
            mặt). Nếu khô rõ hơn 2–3 ngày liên tiếp, tạm bỏ 1 đêm active gần nhất (ưu tiên bỏ AHA
            hoặc BHA trước, giữ Azelaic vì dịu hơn) rồi quay lại khi da ổn.
          </p>
        </div>
      </div>

      <div className="month-note">
        <h3>Về Retinol, Retinal và Tretinoin</h3>
        <p>
          Routine hiện tại đã có <code>AHA 8%</code>, <code>BHA 2%</code>,{" "}
          <code>Azelaic acid 15%</code>, <code>Niacinamide 15%</code> và tẩy da chết vật lý — thêm
          retinoid ngay dễ gây kích ứng, bong tróc và &quot;purging&quot; kéo dài.
        </p>
        <p>
          — <strong>Thay thế, đừng cộng thêm:</strong> Retinol 0.01–0.03% thay cho một đêm
          AHA/Azelaic, 1–2 lần/tuần.
          <br />
          — <strong>Không kết hợp cùng đêm</strong> với AHA/BHA hoặc sau tẩy da chết vật lý.
          <br />
          — <strong>Retinal</strong> mạnh &amp; nhanh hơn nhưng cũng kích ứng hơn — chuyển sang sau
          khi quen Retinol.
          <br />
          — <strong>Tretinoin</strong> là thuốc kê đơn — nên hỏi bác sĩ da liễu trước khi dùng.
          <br />
          — An toàn nhất: để da thích nghi routine hiện tại 4–6 tuần trước đã.
        </p>
      </div>
    </>
  );
}

function HairExtras() {
  return (
    <div className="note-box">
      <strong>Nguyên tắc xuyên suốt 💛</strong> — không gội đầu quá 3–4 lần/tuần để tránh khô da
      đầu. Tẩy da chết da đầu và ủ tóc chuyên sâu chỉ nên dùng 1 lần/tuần, không làm cùng lúc.
      Những ngày nghỉ gội là lúc để dầu dưỡng da đầu (Mielle, dầu hoa hồng, tinh dầu bưởi) thẩm
      thấu tốt nhất.
    </div>
  );
}

function BodyExtras() {
  return (
    <div className="note-box">
      <strong>Nguyên tắc xuyên suốt 🌰</strong> — thoa dầu khô Nuxe khi da còn ẩm ngay sau khi tắm
      để khoá ẩm tốt nhất. Tẩy da chết cà phê Cocoon chỉ nên dùng 2 lần/tuần, tập trung vùng khuỷu
      tay, đầu gối, gót chân — dùng quá thường xuyên dễ làm khô da.
    </div>
  );
}

const HERO: Record<Category, () => JSX.Element> = {
  face: FaceHero,
  hair: HairHero,
  body: BodyHero,
};

const EXTRAS: Record<Category, () => JSX.Element> = {
  face: FaceExtras,
  hair: HairExtras,
  body: BodyExtras,
};

const GALLERY_TITLE: Record<Category, string> = {
  face: "Tủ mỹ phẩm của bạn",
  hair: "Tủ chăm tóc của bạn",
  body: "Tủ dưỡng thể của bạn",
};

export default function CategorySection({
  category,
  activeDay,
  onSelectDay,
}: {
  category: Category;
  activeDay: number;
  onSelectDay: (index: number) => void;
}) {
  const data = routine[category];
  const Hero = HERO[category];
  const Extras = EXTRAS[category];

  return (
    <section className={`category ${THEME_CLASS[category]}`.trim()}>
      <Hero />

      <h2 className="section-title">{GALLERY_TITLE[category]}</h2>
      <Gallery products={data.products} />

      <DayTabs days={data.days} activeDay={activeDay} onSelect={onSelectDay} />
      <DayPanel day={data.days[activeDay]} category={category} />

      <Extras />
    </section>
  );
}
