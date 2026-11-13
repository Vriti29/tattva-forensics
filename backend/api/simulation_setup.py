from backend.simulation.simulation_service import SimulationService
from backend.api.simulation_routes import router


def install_simulation_api(
    app,
    analysis_function,
    evidence_store,
    baseline_store
):

    app.state.simulation_service = SimulationService(
        analysis_function
    )

    app.state.evidence_store = evidence_store

    app.state.baseline_store = baseline_store

    app.include_router(router)