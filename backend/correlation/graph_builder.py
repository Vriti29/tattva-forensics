import networkx as nx

def build_evidence_graph(records, relationships):
    graph = nx.Graph()

    for record in records:
        if isinstance(record, dict):
            data = record
        else:
            data = record.model_dump(mode="json")

        evidence_id = data["evidence_id"]
        graph.add_node(
            evidence_id,
            node_type="evidence",
            event_type=data.get("event_type"),
            timestamp=str(data.get("timestamp")),
            user_id=data.get("user_id")
        )

    for relationship in relationships:
        source = relationship.get("source_evidence_id")
        target = relationship.get("target_evidence_id")

        if source in graph and target in graph and source != target:
            graph.add_edge(
                source,
                target,
                relationship_type=relationship.get("relationship_type"),
                relationship_score=relationship.get("relationship_score", 0.0),
                description=relationship.get("description", "")
            )

    return graph

def graph_to_dict(graph):
    return {
        "nodes": [
            {"id": node, **data}
            for node, data in graph.nodes(data=True)
        ],
        "edges": [
            {"source": source, "target": target, **data}
            for source, target, data in graph.edges(data=True)
        ]
    }