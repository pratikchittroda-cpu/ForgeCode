use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum StepStatus {
    Pending,
    InProgress,
    Completed,
    Error(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlanStep {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: StepStatus,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Plan {
    pub id: String,
    pub goal: String,
    pub steps: Vec<PlanStep>,
}

pub struct Orchestrator {
    // State for current active plan
    pub active_plan: Option<Plan>,
}

impl Orchestrator {
    pub fn new() -> Self {
        Self { active_plan: None }
    }

    pub fn set_plan(&mut self, plan: Plan) {
        self.active_plan = Some(plan);
    }

    pub fn update_step_status(&mut self, step_id: &str, status: StepStatus) -> Result<(), String> {
        if let Some(plan) = &mut self.active_plan {
            if let Some(step) = plan.steps.iter_mut().find(|s| s.id == step_id) {
                step.status = status;
                return Ok(());
            }
            return Err(format!("Step {} not found", step_id));
        }
        Err("No active plan".to_string())
    }

    pub fn create_plan(&mut self, goal: &str) -> Plan {
        self.create_plan_from_ai(goal, vec![
            ("Analyze Repository".to_string(), "Scanning for relevant files".to_string()),
            ("Generate Implementation".to_string(), "Writing code patches".to_string()),
            ("Validate Changes".to_string(), "Running tests".to_string())
        ])
    }

    pub fn create_plan_from_ai(&mut self, goal: &str, ai_steps: Vec<(String, String)>) -> Plan {
        let mut steps = Vec::new();
        for (i, (title, description)) in ai_steps.into_iter().enumerate() {
            steps.push(PlanStep {
                id: (i + 1).to_string(),
                title,
                description,
                status: StepStatus::Pending,
            });
        }

        let plan = Plan {
            id: uuid::Uuid::new_v4().to_string(),
            goal: goal.to_string(),
            steps,
        };
        self.active_plan = Some(plan.clone());
        plan
    }
}
