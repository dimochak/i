package org.igov.model.subject;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

public class VSubjectGroupTreeResult implements IVisitor  {
	
	private static final Log LOG = LogFactory.getLog(VSubjectGroupTreeResult.class);
	
	@Override
	public void deepLevel(VSubjectGroupResultNode vSubjectGroupResult) {
		LOG.info("VSubjectGroupResultNode "+vSubjectGroupResult.toString());
		
	}

	@Override
	public void deepLevel(VSubjectGroupParentNode vSubjectGroupResult) {
		LOG.info("VSubjectGroupParentNode "+vSubjectGroupResult.toString());
		
	}

	@Override
	public void deepLevel(VSubjectGroupChildrenNode vSubjectGroupNode) {
		LOG.info("VSubjectGroupChildrenNode "+vSubjectGroupNode.toString());
		
	}

	@Override
	public void deepLevel(SubjectGroup subjectGroup) {
		LOG.info("SubjectGroupppppppppppp "+subjectGroup.toString());
		
	}

	

}
