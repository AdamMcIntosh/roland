"""Cost tracking utilities for oh-my-goose."""

_total_cost: float = 0.0


def track_cost(amount: float) -> None:
    """Track API call cost.
    
    Args:
        amount: The cost amount to add.
    """
    global _total_cost
    _total_cost += amount


def get_total_cost() -> float:
    """Get total accumulated cost.
    
    Returns:
        The total cost as a float.
    """
    global _total_cost
    return _total_cost
