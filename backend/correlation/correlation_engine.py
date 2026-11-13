from .entity_matcher import match_entities
from .temporal_correlator import correlate_temporal_events
from .sequence_analyzer import analyze_sequences
from .relationship_scorer import score_relationships
from .graph_builder import build_evidence_graph, graph_to_dict

def correlate_evidence(records):
    records = list(records)

    entity_matches = match_entities(records)
    relationships = []

    for match in entity_matches:
        evidence_ids = match["evidence_ids"]
        for index, first in enumerate(evidence_ids):
            for second in evidence_ids[index + 1:]:
                relationships.append({
                    "source_evidence_id": first,
                    "target_evidence_id": second,
                    "relationship_type": "ENTITY_MATCH",
                    "description": f"Shared {match['entity_type']}: {match['entity_value']}"
                })

    relationships.extend(correlate_temporal_events(records))
    relationships.extend(analyze_sequences(records))
    relationships = score_relationships(relationships)

    graph = build_evidence_graph(records, relationships)

    return {
        "entity_matches": entity_matches,
        "relationships": relationships,
        "total_relationships": len(relationships),
        "graph": graph_to_dict(graph)
    }