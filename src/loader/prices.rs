use crate::model::PriceObservation;

pub(crate) fn normalize_price_history(
    mut history: Vec<PriceObservation>,
    current_date: &str,
    current_price: f64,
    current_description: &str,
) -> Result<Vec<PriceObservation>, String> {
    if !current_price.is_finite() || current_price < 0.0 {
        return Err("price history contains an invalid current price".to_string());
    }
    let current_description = if current_description.trim().is_empty() {
        "Imported current price"
    } else {
        current_description.trim()
    };
    if !history.iter().any(|entry| {
            entry.date.trim() == current_date.trim()
                && entry.price == current_price
                && entry.description.trim() == current_description
        })
    {
        history.push(PriceObservation {
            date: current_date.trim().to_string(),
            price: current_price,
            description: current_description.to_string(),
        });
    }
    for entry in &mut history {
        if !entry.price.is_finite() || entry.price < 0.0 {
            return Err("price history contains a negative or non-finite price".to_string());
        }
        entry.date = entry.date.trim().to_string();
        entry.description = entry.description.trim().to_string();
    }
    history.sort_by(|left, right| {
        left.date
            .cmp(&right.date)
            .then_with(|| left.price.total_cmp(&right.price))
            .then(left.description.cmp(&right.description))
    });
    history.dedup();
    Ok(history)
}
