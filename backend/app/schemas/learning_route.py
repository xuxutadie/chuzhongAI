"""新学习接口只接收学生输入，不接收客户端判分或掌握状态。"""
from typing import Annotated, Literal
from pydantic import BaseModel,ConfigDict,Field

class RequestBase(BaseModel):
    model_config=ConfigDict(extra='forbid')

class Action(RequestBase):
    request_id:str=Field(min_length=1,max_length=100)
    revision:int=Field(default=0,ge=0)

class CompleteStep(Action):
    reflection:str=Field(default='',max_length=1000)
    responses:dict[str,str]=Field(default_factory=dict,max_length=30)

class Answer(RequestBase):
    event_key:str=Field(min_length=1,max_length=150)
    assignment_id:str=Field(min_length=1,max_length=100)
    answer:str|list[str]|None=None

class Backfill(RequestBase):
    cursor:str|None=Field(default=None,max_length=2048)
    limit:int=Field(default=200,ge=1,le=200)

class Job(Action):
    kind:Literal['analysis','generation']='analysis'
    stage:Literal['understanding','variant','extension','review','challenge']|None=None

class NextPractice(Action):
    stage:Literal['understanding','variant','extension','review','challenge']|None=None

class SubmitPractice(Action):
    answer:str=Field(min_length=1,max_length=60)

class Issue(Action):
    reason:str=Field(min_length=2,max_length=1000)

ChoiceId = Annotated[str, Field(min_length=1, max_length=64)]

class SelfCheckAnswer(RequestBase):
    request_id: str = Field(min_length=1, max_length=100)
    knowledge_point_id: str = Field(min_length=1, max_length=100)
    question_id: str = Field(min_length=1, max_length=100)
    answer: ChoiceId | Annotated[list[ChoiceId], Field(min_length=1, max_length=20)]

class SelfCheckReceipt(BaseModel):
    event_id: int
    result: Literal['correct', 'wrong']
    collection_id: int | None
    answer: str | list[str]
    explanation: str
