import { CheckCircle2, Circle, Clock, AlertCircle, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface Step {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
}

interface PlanPanelProps {
  goal: string;
  steps: Step[];
}

export const PlanPanel: React.FC<PlanPanelProps> = ({ goal, steps }) => {

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-1">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Autonomous Agent</h2>
        <p className="text-xs font-semibold text-foreground leading-tight">{goal || 'Ready for task...'}</p>
      </div>

      <div className="space-y-4">
        {steps.map((step, i) => (
          <motion.div 
            key={step.id} 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-start space-x-3 group"
          >
            <div className="mt-0.5 shrink-0">
              {step.status === 'completed' && <CheckCircle2 size={14} className="text-green-500" />}
              {step.status === 'in-progress' && <Clock size={14} className="text-primary animate-spin" />}
              {step.status === 'pending' && <Circle size={14} className="text-muted-foreground/30" />}
              {step.status === 'error' && <AlertCircle size={14} className="text-destructive" />}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <p className={`text-[11px] font-medium ${step.status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {step.title}
                </p>
                {step.status === 'in-progress' && (
                  <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full animate-pulse">Running</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">{step.description}</p>
              {step.status === 'in-progress' && (
                <div className="mt-2 h-1 w-full bg-secondary/50 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="h-full bg-primary" 
                  />
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="pt-4 border-t border-white/5">
        <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
          <p className="text-[10px] text-primary font-medium mb-1 uppercase tracking-tight">AI Reasoning</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            I've identified that the `memory-engine` needs a new SQLite table for metadata. I'm now mapping the relationships between `Parser` and `VectorStore`.
          </p>
        </div>
      </div>
    </div>
  );
};
