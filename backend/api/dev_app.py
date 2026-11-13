from fastapi import FastAPI

from backend.api.simulation_setup import install_simulation_api


app = FastAPI(
    title="TATTVA FORENSICS",
    description="What-If Investigation Simulator API",
    version="1.0.0"
)


# ----------------------------------
# SAMPLE ANALYSIS FUNCTION
# ----------------------------------

def sample_analysis(records):

    findings = []
    relationships = []

    for index in range(len(records) - 1):

        first = records[index]
        second = records[index + 1]

        relationships.append({
            "relationship_id": f"REL-{index + 1:03}",
            "source_evidence_id": first["evidence_id"],
            "target_evidence_id": second["evidence_id"],
            "relationship_type": "SEQUENCE"
        })

    return {
        "findings": findings,
        "relationships": relationships,
        "graph": {
            "nodes": [
                {"id": item["evidence_id"]}
                for item in records
            ],
            "edges": [
                {"id": item["relationship_id"]}
                for item in relationships
            ]
        }
    }


# ----------------------------------
# SAMPLE EVIDENCE
# ----------------------------------

evidence_store = {
    "INV-001": [
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
}


# ----------------------------------
# SAMPLE BASELINE ANALYSIS
# ----------------------------------

baseline_store = {
    "ANL-001": sample_analysis(
        evidence_store["INV-001"]
    )
}


# ----------------------------------
# REGISTER SIMULATION API
# ----------------------------------

install_simulation_api(
    app=app,
    analysis_function=sample_analysis,
    evidence_store=evidence_store,
    baseline_store=baseline_store
)


@app.get("/")
def home():

    return {
        "project": "TATTVA FORENSICS",
        "module": "What-If Investigation Simulator",
        "status": "API RUNNING"
    }