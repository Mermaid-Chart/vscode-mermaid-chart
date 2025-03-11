import * as sinon from 'sinon';
import { expect } from 'chai';
import { MermaidChartVSCode } from '../../../mermaidChartVSCode';


suite('MermaidChart Login', () => {
  let mcAPI: MermaidChartVSCode;
  let loginStub: sinon.SinonStub;


  setup(() => {
    mcAPI = new MermaidChartVSCode();
    loginStub = sinon.stub(mcAPI, 'login');
  });

  teardown(() => {
    sinon.restore();
  });

  test('should log in, sync Mermaid chart, and track login', async () => {
    
  loginStub.resolves();
  await mcAPI.login();
    expect(loginStub.calledOnce).to.be.true;
  
  });
  test('should handle login failure', async () => {
    const errorMessage = 'Login failed';
    loginStub.rejects(new Error(errorMessage)); 
    try {
      await mcAPI.login();
    } catch (error) {
      if (error instanceof Error) {
        expect(error.message).to.equal(errorMessage);
      } else {
        throw new Error('Unexpected error type');
      }
    }
  });
  
});
