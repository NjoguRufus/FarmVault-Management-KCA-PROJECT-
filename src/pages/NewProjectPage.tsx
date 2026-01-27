import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Sprout } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { CropType } from '@/types';
import { cropStageConfig, generateStageTimeline, getCropStages } from '@/lib/cropStageConfig';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

export default function NewProjectPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [cropType, setCropType] = useState<CropType>('tomatoes');
  const [location, setLocation] = useState('');
  const [acreage, setAcreage] = useState('');
  const [budget, setBudget] = useState('');
  const [plantingDate, setPlantingDate] = useState<Date | undefined>(new Date());
  const [startingStageIndex, setStartingStageIndex] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const stages = useMemo(() => getCropStages(cropType), [cropType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !plantingDate) return;

    setSaving(true);
    try {
      const projectRef = await addDoc(collection(db, 'projects'), {
        name,
        companyId: user.companyId,
        cropType,
        status: 'active',
        startDate: plantingDate,
        plantingDate,
        startingStageIndex,
        location,
        acreage: Number(acreage || '0'),
        budget: Number(budget || '0'),
        createdAt: serverTimestamp(),
        createdBy: user.id,
      });

      const stageDefs = getCropStages(cropType);
      const timeline = generateStageTimeline(cropType, plantingDate, startingStageIndex);
      
      // Create all stages: completed ones before starting index, and future ones
      for (let i = 0; i < stageDefs.length; i++) {
        const def = stageDefs[i];
        
        if (i < startingStageIndex) {
          // Create completed stages for stages before the starting index
          const completedStartDate = new Date(plantingDate);
          completedStartDate.setDate(completedStartDate.getDate() - (startingStageIndex - i) * 7); // Rough estimate
          const completedEndDate = new Date(completedStartDate);
          completedEndDate.setDate(completedEndDate.getDate() + def.expectedDurationDays - 1);
          
          await addDoc(collection(db, 'projectStages'), {
            projectId: projectRef.id,
            companyId: user.companyId,
            cropType,
            stageName: def.name,
            stageIndex: def.order,
            startDate: completedStartDate,
            endDate: completedEndDate,
            expectedDurationDays: def.expectedDurationDays,
            status: 'completed',
            createdAt: serverTimestamp(),
          });
        } else {
          // Create stages from the timeline (starting from startingStageIndex)
          const timelineStage = timeline.find(t => t.stageIndex === def.order);
          if (timelineStage) {
            await addDoc(collection(db, 'projectStages'), {
              projectId: projectRef.id,
              companyId: user.companyId,
              cropType,
              stageName: timelineStage.stageName,
              stageIndex: timelineStage.stageIndex,
              startDate: timelineStage.startDate,
              endDate: timelineStage.endDate,
              expectedDurationDays: timelineStage.expectedDurationDays,
              createdAt: serverTimestamp(),
            });
          }
        }
      }

      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectStages'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });

      navigate('/projects', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="fv-card space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Sprout className="h-5 w-5 text-primary" />
                New Project
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Define your crop, planting date and starting stage. FarmVault will generate the
                entire season timeline.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Project Name</label>
              <input
                className="fv-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Butterscotch Tomatoes – Season 1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Crop</label>
                <Select
                  value={cropType}
                  onValueChange={(val) => {
                    const asCrop = val as CropType;
                    setCropType(asCrop);
                    setStartingStageIndex(0);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select crop" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tomatoes">Tomatoes</SelectItem>
                    <SelectItem value="french-beans">French Beans</SelectItem>
                    <SelectItem value="capsicum">Capsicum</SelectItem>
                    <SelectItem value="maize">Maize</SelectItem>
                    <SelectItem value="watermelons">Watermelons</SelectItem>
                    <SelectItem value="rice">Rice</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Starting Stage</label>
                <Select
                  value={String(startingStageIndex)}
                  onValueChange={(val) => setStartingStageIndex(Number(val))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select starting stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.order} value={String(stage.order)}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Planting Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="fv-input flex items-center justify-between text-left"
                    >
                      <span>
                        {plantingDate
                          ? plantingDate.toLocaleDateString('en-KE', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Select date'}
                      </span>
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={plantingDate}
                      onSelect={setPlantingDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Location</label>
                  <input
                    className="fv-input"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="North Field"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Acreage (acres)</label>
                <input
                  className="fv-input"
                  type="number"
                  min={0}
                  value={acreage}
                  onChange={(e) => setAcreage(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Budget (KES)</label>
                <input
                  className="fv-input"
                  type="number"
                  min={0}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="fv-btn fv-btn--secondary"
                onClick={() => navigate('/projects')}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="fv-btn fv-btn--primary"
              >
                {saving ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

