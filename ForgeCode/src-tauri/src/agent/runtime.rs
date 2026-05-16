use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::AppHandle;
use crate::agent::orchestrator::{Plan, StepStatus};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum AgentState {
    Idle,
    Planning,
    Executing(String), // step_id
    Verifying,
    WaitingForPermission(String), // tool_name
    Paused,
}

#[derive(Clone)]
pub struct AgentRuntime {
    pub state: Arc<Mutex<AgentState>>,
    pub current_plan: Arc<Mutex<Option<Plan>>>,
    app_handle: AppHandle,
}

impl AgentRuntime {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            state: Arc::new(Mutex::new(AgentState::Idle)),
            current_plan: Arc::new(Mutex::new(Option::None)),
            app_handle,
        }
    }

    pub async fn start_task(&self, goal: String) {
        {
            let mut state = self.state.lock().await;
            *state = AgentState::Planning;
        }
        self.emit_event("agent_state_changed", &AgentState::Planning);

        // Simulated Planning Step
        // In the next update, we will integrate the actual LLM call to generate a dynamic Plan
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        let plan = Plan {
            id: uuid::Uuid::new_v4().to_string(),
            goal: goal.clone(),
            steps: vec![
                crate::agent::orchestrator::PlanStep {
                    id: "1".to_string(),
                    title: "Analyze Requirements".to_string(),
                    description: format!("Reviewing code relevant to: {}", goal),
                    status: StepStatus::InProgress,
                },
                crate::agent::orchestrator::PlanStep {
                    id: "2".to_string(),
                    title: "Execute Implementation".to_string(),
                    description: "Applying surgical code patches".to_string(),
                    status: StepStatus::Pending,
                }
            ],
        };

        {
            let mut plan_lock = self.current_plan.lock().await;
            *plan_lock = Some(plan.clone());
            
            let mut state = self.state.lock().await;
            *state = AgentState::Executing("1".to_string());
        }
        
        self.emit_event("plan_updated", &plan);
        self.emit_event("agent_state_changed", &AgentState::Executing("1".to_string()));
    }

    fn emit_event<S: Serialize + Clone>(&self, event: &str, payload: S) {
        let _ = tauri::Manager::emit_all(&self.app_handle, event, payload);
    }
}
