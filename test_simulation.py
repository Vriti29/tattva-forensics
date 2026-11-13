from backend.simulation.simulation_service import SimulationService


# Sample analysis function.
# Later replace this with Disha's real analysis engine.

def sample_analysis(records):

    findings = []

    relationships = []

    for i in range(len(records) - 1):

        first = records[i]
        second = records[i + 1]

        relationships.append({
            "relationship_id": f"REL-{i+1:03}",
            "source_evidence_id": first["evidence_id"],
            "target_evidence_id": second["evidence_id"],
            "relationship_type": "SEQUENCE"
        })

    return {
        "findings": findings,
        "relationships": relationships,
        "graph": {
            "nodes": [
                {
                    "id": item["evidence_id"]
                }
                for item in records
            ],
            "edges": [
                {
                    "id": item["relationship_id"]
                }
                for item in relationships
            ]
        }
    }


# ORIGINAL EVIDENCE

records = [
    {
        "evidence_id": "EV-001",
        "timestamp": "2026-11-09T09:00:00Z"
    },
    {
        "evidence_id": "EV-002",
        "timestamp": "2026-11-09T09:05:00Z"
    },
    {
        "evidence_id": "EV-003",
        "timestamp": "2026-11-09T09:08:00Z"
    },
    {
        "evidence_id": "EV-004",
        "timestamp": "2026-11-09T09:15:00Z"
    }
]


baseline = sample_analysis(records)

service = SimulationService(sample_analysis)


# CREATE SCENARIO

scenario = service.create_scenario(
    "INV-001",
    "ANL-001",
    "Network Transfer Test",
    "Testing event exclusion",
    [item["evidence_id"] for item in records]
)

print("\nSCENARIO CREATED:", scenario.scenario_id)


# EXCLUDE EVENT

service.exclude_event(
    scenario.scenario_id,
    "EV-004"
)


# MODIFY TIMESTAMP

service.modify_timestamp(
    scenario.scenario_id,
    "EV-003",
    "2026-11-09T09:08:00Z",
    "2026-11-09T10:08:00Z"
)


# RUN SIMULATION

result = service.run_simulation(
    scenario.scenario_id,
    records,
    baseline
)

print("\nSIMULATION RESULT:")
print(result.model_dump())


# COMPARE

comparison = service.compare_results(
    scenario.scenario_id,
    baseline
)

print("\nCOMPARISON RESULT:")
print(comparison)


# AUDIT HISTORY

history = service.audit_manager.get_history(
    scenario.scenario_id
)

print("\nAUDIT HISTORY:")

for item in history:
    print(item.model_dump())


# VERIFY ORIGINAL EVIDENCE

print("\nORIGINAL EVIDENCE:")
print(records)

assert len(records) == 4

assert records[2]["timestamp"] == "2026-11-09T09:08:00Z"

print("\nALL TESTS PASSED!")