use crate::locale;
use crate::model::{GroceryItem, GroceryResult};

const PAGE_WIDTH: f64 = 595.28;
const PAGE_HEIGHT: f64 = 841.89;
const MARGIN: f64 = 28.0;
const GAP: f64 = 18.0;
const HEADER_HEIGHT: f64 = 28.0;
const CATEGORY_HEIGHT: f64 = 16.0;
const SUBCATEGORY_HEIGHT: f64 = 15.0;
const ITEM_HEIGHT: f64 = 27.0;

#[derive(Clone)]
enum Row {
    Category(String),
    Subcategory(String),
    Item(GroceryItem),
}

struct Block {
    category: String,
    show_category: bool,
    subcategory: String,
    items: Vec<GroceryItem>,
}

struct Placement {
    page: usize,
    column: usize,
    y: f64,
    row: Row,
}

fn blocks(grocery: &GroceryResult, language: &str) -> Vec<Block> {
    grocery
        .categories
        .iter()
        .flat_map(|category| {
            category
                .subcategories
                .iter()
                .enumerate()
                .map(|(index, subcategory)| {
                    let code = if subcategory.name.is_empty() {
                        category.name.clone()
                    } else {
                        format!("{}::{}", category.name, subcategory.name)
                    };
                    let label = locale::category_label(language, &code);
                    let (category_label, subcategory_label) =
                        label.split_once("::").unwrap_or((&label, ""));
                    Block {
                        category: category_label.to_string(),
                        show_category: index == 0,
                        subcategory: subcategory_label.to_string(),
                        items: subcategory.items.clone(),
                    }
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

fn block_height(block: &Block) -> f64 {
    (if block.show_category {
        CATEGORY_HEIGHT
    } else {
        0.0
    }) + (if block.subcategory.is_empty() {
        0.0
    } else {
        SUBCATEGORY_HEIGHT
    }) + block.items.len() as f64 * ITEM_HEIGHT
}

fn layout(grocery: &GroceryResult, language: &str) -> (Vec<Placement>, usize) {
    let blocks = blocks(grocery, language);
    let top = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT;
    let bottom = MARGIN;
    let available_height = top - bottom;
    let total_height: f64 = blocks.iter().map(block_height).sum();
    let first_column_target = available_height.min((total_height / 2.0).ceil());
    let mut placements = Vec::new();
    let mut page = 0;
    let mut column = 0;
    let mut y = top;

    let advance = |page: &mut usize, column: &mut usize, y: &mut f64| {
        *column += 1;
        *y = top;
        if *column > 1 {
            *page += 1;
            *column = 0;
        }
    };

    for block in blocks {
        let height = block_height(&block);
        let used = top - y;
        let balance_first_page =
            page == 0 && column == 0 && used > 0.0 && used + height > first_column_target;
        if (height > y - bottom && y != top) || balance_first_page {
            advance(&mut page, &mut column, &mut y);
        }

        if block.show_category || y == top {
            placements.push(Placement {
                page,
                column,
                y,
                row: Row::Category(block.category.clone()),
            });
            y -= CATEGORY_HEIGHT;
        }
        if !block.subcategory.is_empty() {
            placements.push(Placement {
                page,
                column,
                y,
                row: Row::Subcategory(block.subcategory.clone()),
            });
            y -= SUBCATEGORY_HEIGHT;
        }
        for item in block.items {
            if y - ITEM_HEIGHT < bottom {
                advance(&mut page, &mut column, &mut y);
                placements.push(Placement {
                    page,
                    column,
                    y,
                    row: Row::Category(block.category.clone()),
                });
                y -= CATEGORY_HEIGHT;
                if !block.subcategory.is_empty() {
                    placements.push(Placement {
                        page,
                        column,
                        y,
                        row: Row::Subcategory(block.subcategory.clone()),
                    });
                    y -= SUBCATEGORY_HEIGHT;
                }
            }
            placements.push(Placement {
                page,
                column,
                y,
                row: Row::Item(item),
            });
            y -= ITEM_HEIGHT;
        }
    }
    (placements, page + 1)
}

fn number(value: f64) -> String {
    let mut text = format!("{value:.2}");
    while text.ends_with('0') {
        text.pop();
    }
    if text.ends_with('.') {
        text.pop();
    }
    text
}

fn text_width(text: &str, size: f64, bold: bool) -> f64 {
    text.chars().count() as f64 * size * if bold { 0.55 } else { 0.50 }
}

fn fit_text(text: &str, size: f64, width: f64, bold: bool) -> String {
    if text_width(text, size, bold) <= width {
        return text.to_string();
    }
    let mut value = text.to_string();
    while !value.is_empty() && text_width(&format!("{value}..."), size, bold) > width {
        value.pop();
    }
    format!("{value}...")
}

fn win_ansi(character: char) -> u8 {
    match character {
        '\u{20ac}' => 0x80,
        '\u{201a}' => 0x82,
        '\u{0192}' => 0x83,
        '\u{201e}' => 0x84,
        '\u{2026}' => 0x85,
        '\u{2020}' => 0x86,
        '\u{2021}' => 0x87,
        '\u{02c6}' => 0x88,
        '\u{2030}' => 0x89,
        '\u{0160}' => 0x8a,
        '\u{2039}' => 0x8b,
        '\u{0152}' => 0x8c,
        '\u{017d}' => 0x8e,
        '\u{2018}' => 0x91,
        '\u{2019}' => 0x92,
        '\u{201c}' => 0x93,
        '\u{201d}' => 0x94,
        '\u{2022}' => 0x95,
        '\u{2013}' => 0x96,
        '\u{2014}' => 0x97,
        '\u{02dc}' => 0x98,
        '\u{2122}' => 0x99,
        '\u{0161}' => 0x9a,
        '\u{203a}' => 0x9b,
        '\u{0153}' => 0x9c,
        '\u{017e}' => 0x9e,
        '\u{0178}' => 0x9f,
        value if value as u32 <= 0xff => value as u8,
        _ => b'?',
    }
}

fn pdf_string(text: &str) -> Vec<u8> {
    let mut bytes = Vec::new();
    for character in text.chars() {
        let byte = win_ansi(character);
        if matches!(byte, b'(' | b')' | b'\\') {
            bytes.push(b'\\');
        }
        bytes.push(byte);
    }
    bytes
}

fn push_text(
    stream: &mut Vec<u8>,
    font: &str,
    size: f64,
    x: f64,
    y: f64,
    color: (f64, f64, f64),
    text: &str,
) {
    stream.extend_from_slice(
        format!(
            "BT /{font} {size:.2} Tf {:.3} {:.3} {:.3} rg 1 0 0 1 {x:.2} {y:.2} Tm (",
            color.0, color.1, color.2
        )
        .as_bytes(),
    );
    stream.extend_from_slice(&pdf_string(text));
    stream.extend_from_slice(b") Tj ET\n");
}

fn push_rect(
    stream: &mut Vec<u8>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    color: (f64, f64, f64),
) {
    stream.extend_from_slice(
        format!(
            "q {:.3} {:.3} {:.3} rg {x:.2} {y:.2} {width:.2} {height:.2} re f Q\n",
            color.0, color.1, color.2
        )
        .as_bytes(),
    );
}

fn push_stroked_rect(stream: &mut Vec<u8>, x: f64, y: f64, width: f64, height: f64) {
    stream.extend_from_slice(
        format!("q 0.20 0.18 0.16 RG 0.7 w {x:.2} {y:.2} {width:.2} {height:.2} re S Q\n")
            .as_bytes(),
    );
}

fn push_line(stream: &mut Vec<u8>, x1: f64, y1: f64, x2: f64, y2: f64) {
    stream.extend_from_slice(
        format!(
            "q 0.84 0.82 0.78 RG 0.25 w {x1:.2} {y1:.2} m {x2:.2} {y2:.2} l S Q\n"
        )
        .as_bytes(),
    );
}

fn page_streams(grocery: &GroceryResult, language: &str) -> Vec<Vec<u8>> {
    let (placements, page_count) = layout(grocery, language);
    let column_width = (PAGE_WIDTH - MARGIN * 2.0 - GAP) / 2.0;
    let mut streams = vec![Vec::new(); page_count];
    let strings = locale::pdf_strings(language).expect("PDF locale registry cannot be empty");
    let total = format!("{:.2} EUR", grocery.estimated_purchase_total);
    let total = match strings.decimal_separator.as_str() {
        "." => total,
        separator => total.replace('.', separator),
    };

    for (index, stream) in streams.iter_mut().enumerate() {
        push_text(
            stream,
            "F2",
            11.0,
            MARGIN,
            PAGE_HEIGHT - MARGIN + 3.0,
            (0.18, 0.16, 0.14),
            &format!("{} - {total}", strings.grocery_title),
        );
        push_text(
            stream,
            "F1",
            8.0,
            PAGE_WIDTH - MARGIN - 22.0,
            PAGE_HEIGHT - MARGIN + 3.0,
            (0.40, 0.38, 0.35),
            &format!("{}/{}", index + 1, page_count),
        );
    }

    for placement in placements {
        let stream = &mut streams[placement.page];
        let x = MARGIN + placement.column as f64 * (column_width + GAP);
        match placement.row {
            Row::Category(text) => {
                push_rect(
                    stream,
                    x,
                    placement.y - CATEGORY_HEIGHT + 1.0,
                    column_width,
                    CATEGORY_HEIGHT,
                    (0.20, 0.18, 0.16),
                );
                push_text(
                    stream,
                    "F2",
                    8.5,
                    x + 4.0,
                    placement.y - 11.0,
                    (1.0, 1.0, 1.0),
                    &fit_text(&text, 8.5, column_width - 8.0, true),
                );
            }
            Row::Subcategory(text) => {
                push_rect(
                    stream,
                    x,
                    placement.y - SUBCATEGORY_HEIGHT + 1.0,
                    column_width,
                    SUBCATEGORY_HEIGHT,
                    (0.93, 0.91, 0.87),
                );
                push_text(
                    stream,
                    "F2",
                    8.0,
                    x + 4.0,
                    placement.y - 10.5,
                    (0.25, 0.23, 0.21),
                    &fit_text(&text, 8.0, column_width - 8.0, true),
                );
            }
            Row::Item(item) => {
                push_stroked_rect(stream, x, placement.y - 11.0, 7.0, 7.0);
                let price = format!("{:.2} EUR", item.estimated_purchase_price);
                let price_width = text_width(&price, 7.6, false);
                let name_width = column_width - 18.0 - price_width;
                let left = format!("{} ({})", item.name, item.needed_quantity_text);
                push_text(
                    stream,
                    "F2",
                    8.0,
                    x + 11.0,
                    placement.y - 10.5,
                    (0.16, 0.14, 0.13),
                    &fit_text(&left, 8.0, name_width, true),
                );
                push_text(
                    stream,
                    "F3",
                    7.6,
                    x + column_width - price_width - 2.0,
                    placement.y - 10.5,
                    (0.35, 0.32, 0.30),
                    &price,
                );
                push_text(
                    stream,
                    "F1",
                    7.4,
                    x + 11.0,
                    placement.y - 21.5,
                    (0.43, 0.39, 0.36),
                    &fit_text(
                        &item.purchase_quantity_text,
                        7.4,
                        column_width - 15.0,
                        false,
                    ),
                );
                push_line(
                    stream,
                    x,
                    placement.y - ITEM_HEIGHT + 1.0,
                    x + column_width,
                    placement.y - ITEM_HEIGHT + 1.0,
                );
            }
        }
    }
    streams
}

fn add_object(objects: &mut Vec<Vec<u8>>, bytes: Vec<u8>) -> usize {
    objects.push(bytes);
    objects.len()
}

pub fn generate_grocery_pdf(grocery: &GroceryResult, language: &str) -> Vec<u8> {
    let streams = page_streams(grocery, language);
    let page_count = streams.len();
    let mut objects: Vec<Vec<u8>> = vec![
        Vec::new(),
        Vec::new(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
            .to_vec(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
            .to_vec(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"
            .to_vec(),
    ];
    let mut page_refs = Vec::new();
    for stream in streams {
        let stream_id = add_object(
            &mut objects,
            [
                format!("<< /Length {} >>\nstream\n", stream.len()).as_bytes(),
                &stream,
                b"\nendstream",
            ]
            .concat(),
        );
        let page_id = add_object(
            &mut objects,
            format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {} {}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents {} 0 R >>",
                number(PAGE_WIDTH),
                number(PAGE_HEIGHT),
                stream_id
            )
            .into_bytes(),
        );
        page_refs.push(page_id);
    }
    objects[0] = b"<< /Type /Catalog /Pages 2 0 R >>".to_vec();
    objects[1] = format!(
        "<< /Type /Pages /Count {} /Kids [{}] >>",
        page_count,
        page_refs
            .iter()
            .map(|id| format!("{id} 0 R"))
            .collect::<Vec<_>>()
            .join(" ")
    )
    .into_bytes();

    let mut pdf = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n".to_vec();
    let mut offsets = vec![0usize];
    for (index, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
        pdf.extend_from_slice(object);
        pdf.extend_from_slice(b"\nendobj\n");
    }
    let xref = pdf.len();
    pdf.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    pdf.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            objects.len() + 1
        )
        .as_bytes(),
    );
    pdf
}
