use crate::model::PriceObservation;

pub(crate) fn preserve_price_history(
    history: &mut Vec<PriceObservation>,
    previous: &[PriceObservation],
    date: &str,
    price: f64,
    description: &str,
) {
    if history.is_empty() {
        history.extend_from_slice(previous);
    }
    let description = if description.trim().is_empty() {
        "Updated current price"
    } else {
        description.trim()
    };
    if !history.iter().any(|entry| {
        entry.date.trim() == date.trim()
            && entry.price == price
            && entry.description.trim() == description
    }) {
        history.push(PriceObservation {
            date: date.trim().to_string(),
            price,
            description: description.to_string(),
            purchase: None,
        });
    }
    history.sort_by(|left, right| {
        left.date
            .cmp(&right.date)
            .then_with(|| left.price.total_cmp(&right.price))
            .then(left.description.cmp(&right.description))
    });
    history.dedup();
}
