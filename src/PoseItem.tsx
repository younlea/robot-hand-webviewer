import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';

// These types should be defined in a central place, but for now we'll define them here.
type JointPose = {
  [key: string]: number;
};

type RecordedPose = {
  id: string;
  name: string;
  timestamp: number;
  joints: JointPose;
};

export interface PoseItemProps {
  pose: RecordedPose;
  index: number;
  movePose: (dragIndex: number, hoverIndex: number) => void;
  onDelete: (id: string) => void;
  applyPose: (joints: JointPose) => void;
  onEdit: (pose: RecordedPose) => void;
}

export const ItemTypes = {
  POSE: 'pose',
};

export const PoseItem: React.FC<PoseItemProps> = ({ pose, index, movePose, onDelete, applyPose, onEdit }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [{ handlerId }, drop] = useDrop({
    accept: ItemTypes.POSE,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: any, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      movePose(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.POSE,
    item: () => ({ id: pose.id, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      style={{
        padding: '8px',
        marginBottom: '4px',
        backgroundColor: isDragging ? '#e0e0e0' : 'white',
        border: '1px solid #ddd',
        borderRadius: '4px',
        cursor: 'move',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        opacity: isDragging ? 0.5 : 1,
      }}
      data-handler-id={handlerId}
    >
      <span>{pose.name}</span>
      <div>
        <button onClick={() => applyPose(pose.joints)} style={{ marginRight: '4px' }}>적용</button>
        <button onClick={() => onEdit(pose)} style={{ marginRight: '4px' }}>수정</button>
        <button onClick={() => onDelete(pose.id)}>삭제</button>
      </div>
    </div>
  );
};
