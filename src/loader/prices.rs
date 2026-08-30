use crate::model::PriceObservation;

pub(crate) fn normalize_price_history(
    mut history: Vec<PriceObservation>,
    current_date: &str,
    current_price: f64,
    current_price_basis: &str,
    current_description: &str,
) -> Result<Vec<PriceObservation>, String> {
    if !current_price.is_finite() || current_price < 0.0 {
        return Err("price history contains an invalid current price".to_string());
    }
    if !matches!(current_price_basis.trim(), "kg" | "purchase_unit") {
        return Err("price history contains an invalid current price basis".to_string());
    }
    let current_description = if current_description.trim().is_empty() {
        "Imported current price"
    } else {
        current_description.trim()
    };
    if !history.iter().any(|entry| {
            entry.date.trim() == current_date.trim()
                && entry.price == current_price
                && entry.price_basis == current_price_basis.trim()
                && entry.description.trim() == current_description
        })
    {
        history.push(PriceObservation {
            date: current_date.trim().to_string(),
            price: current_price,
            price_basis: current_price_basis.trim().to_string(),
            description: current_description.to_string(),
            purchase: None,
        });
    }
    for entry in &mut history {
        if !entry.price.is_finite() || entry.price < 0.0 {
            return Err("price history contains a negative or non-finite price".to_string());
        }
        entry.price_basis = entry.price_basis.trim().to_string();
        if !matches!(entry.price_basis.as_str(), "kg" | "purchase_unit") {
            return Err("price history contains an invalid price basis".to_string());
        }
        entry.date = entry.date.trim().to_string();
        entry.description = entry.description.trim().to_string();
        if let Some(purchase) = &mut entry.purchase {
            if !purchase.quantity.is_finite() || purchase.quantity <= 0.0 {
                return Err("price history purchase contains an invalid quantity".to_string());
            }
            if purchase.unit.trim().is_empty() {
                return Err("price history purchase contains an empty unit".to_string());
            }
            if !purchase.total_paid.is_finite() || purchase.total_paid < 0.0 {
                return Err("price history purchase contains an invalid total paid".to_string());
            }
            purchase.unit = purchase.unit.trim().to_string();
            purchase.store = purchase.store.trim().to_string();
            purchase.purchase_id = purchase.purchase_id.trim().to_string();
        }
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
