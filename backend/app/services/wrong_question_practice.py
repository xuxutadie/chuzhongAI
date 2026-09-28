"""审核模板与分层状态机；模型不能提供不可复算的参考答案。"""
from copy import deepcopy
from fractions import Fraction
from app.services.transition_diagrams import label, polygon

STAGES = ('understanding','variant','extension','review','challenge')


def build_verified_question(template_id, parameters, stage):
    if stage not in STAGES or any(type(v) is not int or abs(v)>200 for v in parameters.values()):
        raise ValueError('模板参数不在审核范围')
    diagram=None
    if template_id=='integer_add':
        a,b=parameters['a'],parameters['b']
        value=Fraction(a+b)
        prompt=f'计算 {a} + ({b})。'
        explanation=f'同号相加取共同符号；异号相加比较绝对值。结果为 {a+b}。'
        if stage in ('extension','challenge'):
            prompt=f'某地早晨气温为 {a}℃，中午变化了 {b}℃，中午气温是多少摄氏度？'
        knowledge=['有理数加减']
    elif template_id=='fraction_add':
        a,b=parameters['a'],parameters['b']
        if not 2<=a<=12 or not 2<=b<=12:
            raise ValueError('分母不在审核范围')
        value=Fraction(1,a)+Fraction(1,b)
        prompt=f'计算 1/{a} + 1/{b}（用最简分数回答）。'
        if stage in ('extension','challenge'):
            prompt=f'两段绳子分别长 1/{a} 米和 1/{b} 米，接在一起共多少米？忽略接头损耗，用最简分数回答。'
        explanation=f'先通分再相加，结果是 {value}。'
        knowledge=['分数加法']
    elif template_id=='percentage':
        part,total=parameters['part'],parameters['total']
        if not 0<part<total<=200:
            raise ValueError('总人数和部分人数不在审核范围')
        value=Fraction(part,total)*100
        if value.denominator!=1:
            raise ValueError('当前模板只投放整数百分率')
        end=-90+float(Fraction(part,total)*360)
        prompt=f'调查 {total} 人，其中 {part} 人喜欢篮球。篮球部分占百分之几？只填写数值。'
        if stage=='challenge':
            prompt=f'调查 {total} 人，其中 {part} 人喜欢篮球。其他同学所占扇形圆心角为多少度？'
            value=Fraction(total-part,total)*360
        diagram={'width':440,'height':260,'alt':f'蓝色篮球 {part} 人，浅灰色其他 {total-part} 人。',
                 'caption':'扇区按人数比例绘制。', 'elements':[
                    {'kind':'sector','cx':130,'cy':125,'r':85,'startAngle':-90,'endAngle':end,'fill':'#3478e5'},
                    {'kind':'sector','cx':130,'cy':125,'r':85,'startAngle':end,'endAngle':270,'fill':'#e5edf5'},
                    label(320,100,f'篮球 {part} 人'),label(320,145,f'其他 {total-part} 人')]}
        explanation=f'先用部分人数除以总人数，再换算。结果为 {value}。'
        if stage=='challenge':
            explanation=f'其他同学有 {total}-{part}={total-part} 人。圆心角 = ({total}-{part})÷{total}×360° = {value}°。'
        knowledge=['百分数与扇形统计图']
    elif template_id=='rectangle_area':
        a,b=parameters['a'],parameters['b']
        if not 1<=a<=30 or not 1<=b<=30:
            raise ValueError('长宽应为正数')
        value=Fraction(a*b)
        prompt=f'长方形长 {a} 厘米、宽 {b} 厘米，面积是多少平方厘米？'
        if stage in ('extension','challenge'):
            prompt=f'一块长方形花圃长 {a} 米、宽 {b} 米，每平方米种 2 棵花，一共种多少棵？'
            value*=2
        diagram={'width':440,'height':260,'alt':f'长方形长 {a}，宽 {b}。','elements':[
            polygon([[90,50],[340,50],[340,195],[90,195]]),label(215,225,str(a)),label(55,120,str(b))]}
        explanation=f'长乘宽得到面积，再结合题目条件，结果为 {value}。'
        knowledge=['长方形面积']
    else:
        raise ValueError('该题型暂不可自动出题')
    return {'id':f'practice-{template_id}','prompt':prompt,'options':[],'answer':str(value),'response_type':'numeric',
            'explanation':explanation,'diagram':diagram,'knowledge_points':knowledge,
            'template_id':template_id,'parameters':parameters,'validator_version':'1'}


def advance_practice(state,result,independent,parameters_hash,stage):
    result_state=deepcopy(state)
    if stage=='challenge':
        return result_state
    result_state.setdefault('independent_hashes',[])
    if result=='wrong':
        result_state['consecutive_errors']=result_state.get('consecutive_errors',0)+1
        result_state['independent_hashes']=[]
        result_state['needs_help']=result_state['consecutive_errors']>=2
        return result_state
    if result!='correct':
        return result_state
    result_state['consecutive_errors']=0
    if not independent:
        result_state['assisted']=True
        return result_state
    if parameters_hash not in result_state['independent_hashes']:
        result_state['independent_hashes'].append(parameters_hash)
    result_state['needs_help']=False
    if stage=='understanding':
        result_state.update(stage='variant',independent_hashes=[])
    elif stage=='variant' and len(result_state['independent_hashes'])>=2:
        result_state.update(stage='extension',independent_hashes=[])
    elif stage=='extension':
        result_state.update(stage='review',independent_hashes=[])
    return result_state


def matched_template(snapshot):
    qid=snapshot.get('id','')
    # 只匹配已核实的具体知识点，不把任意上传文字套入相近题型。
    if qid=='t1-0-4' or qid.startswith('g7u-c2-addition'):
        return 'integer_add'
    if qid=='t1-1-0':
        return 'fraction_add'
    if qid in ('t1-4-1','t1-1-1'):
        return 'percentage'
    if qid=='t1-3-0':
        return 'rectangle_area'
    return None
