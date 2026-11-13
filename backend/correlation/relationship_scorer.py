def score_relationship(relationship):
    relationship_type = relationship.get("relationship_type")

    if relationship_type == "ENTITY_MATCH":
        score = 0.9
    elif relationship_type == "SEQUENCE":
        score = 0.8
    elif relationship_type == "TEMPORAL":
        seconds = relationship.get("time_difference_seconds", 1800)
        score = max(0.1, 0.5 * (1 - seconds / 1800))
    else:
        score = 0.1

    return round(min(max(score, 0.0), 1.0), 3)

def score_relationships(relationships):
    scored = []
    for relationship in relationships:
        scored.append({
            **relationship,
            "relationship_score": score_relationship(relationship)
        })
    return scored